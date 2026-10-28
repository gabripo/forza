package app.forza.health

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.BodyFatRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
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
import java.time.Period
import java.util.concurrent.TimeUnit
import kotlin.math.abs

/**
 * Reads daily steps (last 14 days) and weigh-ins from Health Connect and sends them to Forza!.
 * Weights come from any app that writes to Health Connect, including the EufyLife scale app.
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
            for (w in weightRecords) {
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
                activities.put(
                    JSONObject()
                        .put("start", s.startTime.toString())
                        .put("end", s.endTime.toString())
                        .put("kind", kindOf(s.exerciseType))
                        .put("title", s.title ?: JSONObject.NULL),
                )
            }
        }

        val body = JSONObject().put("source", "health_connect").put("steps", steps).put("weights", weights).put("activities", activities)
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
                        prefs.lastMessage = applicationContext.getString(R.string.synced, steps.length(), weights.length())
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
        private const val NOW = "forza-sync-now"
        private val online = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

        /** A few times a day, whenever the phone is online. */
        fun schedule(context: Context) {
            val request = PeriodicWorkRequestBuilder<SyncWorker>(6, TimeUnit.HOURS).setConstraints(online).build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.UPDATE, request)
        }

        fun syncNow(context: Context) {
            val request = OneTimeWorkRequestBuilder<SyncWorker>().setConstraints(online).build()
            WorkManager.getInstance(context).enqueueUniqueWork(NOW, ExistingWorkPolicy.REPLACE, request)
        }
    }
}
