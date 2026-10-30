package app.forza.health

import android.content.Context
import android.os.Build
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.BodyFatRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.MealType
import androidx.health.connect.client.records.NutritionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.request.AggregateGroupByPeriodRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.Period
import java.time.ZoneId
import java.util.concurrent.TimeUnit
import kotlin.math.abs

/**
 * Reads daily steps (last 14 days), weigh-ins, exercise sessions and meals from Health Connect and
 * sends them to Forza!. Weights come from any app that writes to Health Connect (the EufyLife scale
 * through Google Fit, for example); meals from food diaries such as Build With Science.
 */
class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val prefs = Prefs(applicationContext)
        val url = prefs.url ?: return Result.failure()
        val key = prefs.key ?: return Result.failure()
        if (HealthConnectClient.getSdkStatus(applicationContext) != HealthConnectClient.SDK_AVAILABLE) {
            prefs.lastMessage = applicationContext.getString(R.string.hc_missing)
            return Result.failure()
        }
        val client = HealthConnectClient.getOrCreate(applicationContext)
        val granted = client.permissionController.getGrantedPermissions()
        // What this sync finds, per kind of data: shown here and sent to Forza!, so a family coach can
        // tell "not allowed" from "nothing in Health Connect" without holding the phone.
        fun kind(record: kotlin.reflect.KClass<out androidx.health.connect.client.records.Record>) = Found(HealthPermission.getReadPermission(record) in granted)
        val found = linkedMapOf(
            "steps" to kind(StepsRecord::class),
            "weight" to kind(WeightRecord::class),
            "body_fat" to kind(BodyFatRecord::class),
            "exercise" to kind(ExerciseSessionRecord::class),
            "meals" to kind(NutritionRecord::class),
        )

        val steps = JSONArray()
        if (HealthPermission.getReadPermission(StepsRecord::class) in granted) {
            val start = LocalDate.now().minusDays(14).atStartOfDay()
            val buckets = client.aggregateGroupByPeriod(
                AggregateGroupByPeriodRequest(
                    metrics = setOf(StepsRecord.COUNT_TOTAL),
                    timeRangeFilter = TimeRangeFilter.between(start, LocalDateTime.now()),
                    timeRangeSlicer = Period.ofDays(1),
                ),
            )
            for (bucket in buckets) {
                val count = bucket.result[StepsRecord.COUNT_TOTAL] ?: continue
                steps.put(JSONObject().put("date", bucket.startTime.toLocalDate().toString()).put("steps", count))
                found.getValue("steps").add(bucket.result.dataOrigins.map { it.packageName })
            }
        }

        val weights = JSONArray()
        if (HealthPermission.getReadPermission(WeightRecord::class) in granted) {
            // First sync: a year of history. Afterwards: the last month is enough.
            val days = if (prefs.lastSync == 0L) 365L else 30L
            val range = TimeRangeFilter.after(Instant.now().minus(Duration.ofDays(days)))
            val weightRecords = client.readRecords(ReadRecordsRequest(WeightRecord::class, range, pageSize = 1000)).records
            val fatRecords = if (HealthPermission.getReadPermission(BodyFatRecord::class) in granted) {
                client.readRecords(ReadRecordsRequest(BodyFatRecord::class, range, pageSize = 1000)).records
            } else {
                emptyList()
            }
            if (fatRecords.isNotEmpty()) found.getValue("body_fat").add(fatRecords.map { it.metadata.dataOrigin.packageName }, fatRecords.size)
            for (w in weightRecords) {
                found.getValue("weight").add(listOf(w.metadata.dataOrigin.packageName))
                val item = JSONObject().put("at", w.time.toString()).put("kg", w.weight.inKilograms)
                // Smart scales write body fat a few seconds apart from the weight.
                fatRecords.firstOrNull { abs(Duration.between(it.time, w.time).seconds) < 300 }
                    ?.let { item.put("fat_pct", it.percentage.value) }
                weights.put(item)
            }
        }

        // Walks, runs, rides… shown as activities on the Forza! schedule.
        val activities = JSONArray()
        if (HealthPermission.getReadPermission(ExerciseSessionRecord::class) in granted) {
            val range = TimeRangeFilter.after(Instant.now().minus(Duration.ofDays(14)))
            for (s in client.readRecords(ReadRecordsRequest(ExerciseSessionRecord::class, range, pageSize = 500)).records) {
                found.getValue("exercise").add(listOf(s.metadata.dataOrigin.packageName))
                activities.put(
                    JSONObject()
                        .put("start", s.startTime.toString())
                        .put("end", s.endTime.toString())
                        .put("kind", kindOf(s.exerciseType))
                        .put("title", s.title ?: JSONObject.NULL),
                )
            }
        }

        // Meals: one entry per day and meal (breakfast, lunch…) and per app, so Forza! shows the same
        // diary as the app that wrote it. The server replaces the whole window each time, so edits and
        // deletions in that app are mirrored.
        val meals = JSONArray()
        var mealsSince: Instant? = null
        if (HealthPermission.getReadPermission(NutritionRecord::class) in granted) {
            val zone = ZoneId.systemDefault()
            val days = if (prefs.mealsSynced) 14L else 90L
            val since = LocalDate.now(zone).minusDays(days).atStartOfDay(zone).toInstant()
            mealsSince = since
            val groups = linkedMapOf<String, JSONObject>()
            var page: String? = null
            do {
                val response = client.readRecords(
                    ReadRecordsRequest(NutritionRecord::class, TimeRangeFilter.after(since), pageSize = 1000, pageToken = page),
                )
                for (r in response.records) {
                    found.getValue("meals").add(listOf(r.metadata.dataOrigin.packageName))
                    val day = r.startTime.atZone(r.startZoneOffset ?: zone.rules.getOffset(r.startTime)).toLocalDate()
                    val meal = mealOf(r.mealType)
                    val origin = r.metadata.dataOrigin.packageName
                    val group = groups.getOrPut("$day|$meal|$origin") {
                        // Food apps often store a whole day at noon: place each meal at its usual time instead.
                        val at = day.atTime(MEAL_TIME.getValue(meal)).atZone(zone).toInstant()
                        JSONObject().put("day", day.toString()).put("meal", meal).put("origin", origin).put("at", at.toString()).put("items", JSONArray())
                    }
                    group.getJSONArray("items").put(
                        JSONObject()
                            .put("name", r.name ?: "")
                            .put("kcal", r.energy?.inKilocalories ?: 0.0)
                            .put("protein_g", r.protein?.inGrams ?: 0.0)
                            .put("carbs_g", r.totalCarbohydrate?.inGrams ?: 0.0)
                            .put("fat_g", r.totalFat?.inGrams ?: 0.0)
                            .put("fiber_g", r.dietaryFiber?.inGrams ?: 0.0)
                            .put("sugar_g", r.sugar?.inGrams ?: 0.0),
                    )
                }
                page = response.pageToken
            } while (page != null)
            groups.values.forEach { meals.put(it) }
        }

        val report = JSONObject()
            .put("app", "android")
            .put("android", Build.VERSION.SDK_INT)
            .put("device", "${Build.MANUFACTURER} ${Build.MODEL}")
            .put("helper", runCatching { applicationContext.packageManager.getPackageInfo(applicationContext.packageName, 0).versionName }.getOrNull() ?: JSONObject.NULL)
            .put("history", HealthPermission.PERMISSION_READ_HEALTH_DATA_HISTORY in granted)
            .put("types", JSONObject().apply { found.forEach { (name, f) -> put(name, f.toJson()) } })
        val body = JSONObject().put("source", "health_connect").put("steps", steps).put("weights", weights).put("activities", activities).put("report", report)
            .put("utc_offset_min", BwsSync.utcOffsetMinutes())
        if (mealsSince != null) body.put("meals", meals).put("meals_since", mealsSince.toString())
        return withContext(Dispatchers.IO) {
            try {
                val conn = (URL(url).openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    connectTimeout = 15_000
                    readTimeout = 30_000
                    doOutput = true
                    setRequestProperty("Content-Type", "application/json")
                    setRequestProperty("x-forza-token", key)
                }
                conn.outputStream.use { it.write(body.toString().toByteArray()) }
                val code = conn.responseCode
                conn.disconnect()
                when (code) {
                    200 -> {
                        prefs.lastSync = System.currentTimeMillis()
                        if (mealsSince != null) prefs.mealsSynced = true
                        prefs.lastMessage = summary(applicationContext, found)
                        Result.success()
                    }
                    401 -> {
                        prefs.lastMessage = applicationContext.getString(R.string.bad_key)
                        Result.failure()
                    }
                    else -> {
                        prefs.lastMessage = applicationContext.getString(R.string.server_error, code)
                        Result.retry()
                    }
                }
            } catch (e: Exception) {
                prefs.lastMessage = applicationContext.getString(R.string.offline)
                Result.retry()
            }
        }
    }

    private fun mealOf(type: Int): String = when (type) {
        MealType.MEAL_TYPE_BREAKFAST -> "breakfast"
        MealType.MEAL_TYPE_LUNCH -> "lunch"
        MealType.MEAL_TYPE_DINNER -> "dinner"
        else -> "snack"
    }

    private fun kindOf(type: Int): String = when (type) {
        ExerciseSessionRecord.EXERCISE_TYPE_WALKING -> "walking"
        ExerciseSessionRecord.EXERCISE_TYPE_RUNNING, ExerciseSessionRecord.EXERCISE_TYPE_RUNNING_TREADMILL -> "running"
        ExerciseSessionRecord.EXERCISE_TYPE_BIKING, ExerciseSessionRecord.EXERCISE_TYPE_BIKING_STATIONARY -> "cycling"
        ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_POOL, ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_OPEN_WATER -> "swimming"
        ExerciseSessionRecord.EXERCISE_TYPE_HIKING -> "hiking"
        else -> "other"
    }

    companion object {
        private const val PERIODIC = "forza-sync"
        private val MEAL_TIME = mapOf(
            "breakfast" to LocalTime.of(8, 0),
            "lunch" to LocalTime.of(13, 0),
            "snack" to LocalTime.of(16, 30),
            "dinner" to LocalTime.of(20, 0),
        )
        private const val NOW = "forza-sync-now"
        private val online = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

        /** Every hour, whenever the phone is online (Android may group runs to save battery). */
        fun schedule(context: Context) {
            val request = PeriodicWorkRequestBuilder<SyncWorker>(1, TimeUnit.HOURS).setConstraints(online).build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.UPDATE, request)
        }

        fun syncNow(context: Context) {
            val request = OneTimeWorkRequestBuilder<SyncWorker>().setConstraints(online).build()
            WorkManager.getInstance(context).enqueueUniqueWork(NOW, ExistingWorkPolicy.REPLACE, request)
        }
    }
}

/** One kind of data in one sync: allowed in Health Connect? How many found, written by which apps? */
private class Found(val allowed: Boolean) {
    var count = 0
    val sources = linkedSetOf<String>()

    fun add(origins: Collection<String>, n: Int = 1) {
        count += n
        sources += origins
    }

    fun toJson(): JSONObject = JSONObject().put("allowed", allowed).put("found", count).put("sources", JSONArray(sources.toList()))
}

/** Apps that often write to Health Connect, by their package name. */
private val APP_NAMES = mapOf(
    "com.google.android.apps.fitness" to "Google Fit",
    "com.oceanwing.smarthome" to "EufyLife",
    "com.sec.android.app.shealth" to "Samsung Health",
    "com.mi.health" to "Mi Fitness",
    "com.xiaomi.wearable" to "Mi Fitness",
    "com.huawei.health" to "Huawei Health",
    "com.fitbit.FitbitMobile" to "Fitbit",
    "com.bws.appv2" to "Build With Science",
    "com.google.android.healthconnect.controller" to "Health Connect",
    "com.android.healthconnect.controller" to "Health Connect",
    "android" to "Android",
)

/** A readable name for the app that wrote the data; Health Connect's own step counting is "this phone". */
private fun appName(context: Context, pkg: String): String = when {
    pkg.startsWith("com.android.healthconnect.phone") -> context.getString(R.string.this_phone)
    else -> APP_NAMES[pkg] ?: pkg
}

/** "Steps: 15 days (Google Fit) · Weigh-ins: none…", one line per kind, with what to do when something is missing. */
private fun summary(context: Context, found: Map<String, Found>): String {
    fun apps(f: Found) = f.sources.map { appName(context, it) }.distinct().joinToString(", ")
    fun line(name: String, ok: Int, none: Int, denied: Int): String {
        val f = found.getValue(name)
        return when {
            !f.allowed -> context.getString(denied)
            f.count == 0 -> context.getString(none)
            else -> context.getString(ok, f.count, apps(f))
        }
    }
    return listOf(
        line("steps", R.string.found_steps, R.string.none_steps, R.string.denied_steps),
        line("weight", R.string.found_weight, R.string.none_weight, R.string.denied_weight),
        line("meals", R.string.found_meals, R.string.none_meals, R.string.denied_meals),
    ).joinToString("\n")
}
