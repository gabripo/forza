package app.forza.health

import android.Manifest
import android.app.AlertDialog
import android.app.TimePickerDialog
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.text.format.DateUtils
import android.view.Gravity
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContract
import androidx.activity.result.contract.ActivityResultContracts
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.BodyFatRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.NutritionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.lifecycle.lifecycleScope
import androidx.work.WorkInfo
import androidx.work.WorkManager
import kotlinx.coroutines.launch

/**
 * One simple screen: connection status, "Allow access" and "Sync now".
 * Set-up happens by tapping "Connect the helper" in the Forza! web app,
 * which opens forzahealth://setup?url=...&key=...
 */
class MainActivity : ComponentActivity() {

    private val permissions = setOf(
        HealthPermission.getReadPermission(StepsRecord::class),
        HealthPermission.getReadPermission(WeightRecord::class),
        HealthPermission.getReadPermission(BodyFatRecord::class),
        HealthPermission.getReadPermission(ExerciseSessionRecord::class),
        HealthPermission.getReadPermission(NutritionRecord::class),
        HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND,
        HealthPermission.PERMISSION_READ_HEALTH_DATA_HISTORY,
    )

    private val contract: ActivityResultContract<Set<String>, Set<String>> =
        PermissionController.createRequestPermissionResultContract()
    private val requestPermissions = registerForActivityResult(contract) { granted ->
        if (granted.isNotEmpty()) SyncWorker.syncNow(this)
        refresh()
    }

    private val askNotifications = registerForActivityResult(ActivityResultContracts.RequestPermission()) { refreshBws() }

    private lateinit var prefs: Prefs
    private lateinit var status: TextView
    private lateinit var detail: TextView
    private lateinit var allow: Button
    private lateinit var sync: Button
    private lateinit var bwsStatus: TextView
    private lateinit var bwsTurnOn: Button
    private lateinit var bwsRestricted: Button
    private lateinit var bwsSync: Button
    private lateinit var bwsReminder: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = Prefs(this)
        setContentView(buildUi())
        // Keeps the schedule current after an update (e.g. every 6 hours → every hour).
        if (prefs.isConnected) SyncWorker.schedule(this)
        handleSetupLink(intent)
        WorkManager.getInstance(this).getWorkInfosForUniqueWorkLiveData("forza-sync-now").observe(this) { infos ->
            if (infos.any { it.state.isFinished || it.state == WorkInfo.State.RUNNING }) refresh()
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleSetupLink(intent)
    }

    override fun onResume() {
        super.onResume()
        refresh()
        refreshBws()
    }

    private fun handleSetupLink(intent: Intent?) {
        val uri: Uri = intent?.data ?: return
        if (uri.scheme == "forzahealth" && uri.host == "bws") {
            // "Sync workouts on this phone" in the Forza! app, or the daily reminder.
            startBws()
            setIntent(Intent(this, MainActivity::class.java))
            return
        }
        if (uri.scheme == "forzahealth" && uri.host == "sync") {
            // "Sync now" from the Forza! app: nothing is sent anywhere new, so no confirmation needed.
            if (prefs.isConnected) {
                SyncWorker.syncNow(this)
                detail.text = getString(R.string.syncing)
                Toast.makeText(this, R.string.sync_started, Toast.LENGTH_LONG).show()
            }
            setIntent(Intent(this, MainActivity::class.java))
            return
        }
        if (uri.scheme != "forzahealth" || uri.host != "setup") return
        val url = uri.getQueryParameter("url") ?: return
        val key = uri.getQueryParameter("key") ?: return
        val target = Uri.parse(url)
        if (target.scheme != "https" || target.host.isNullOrBlank()) return
        // Always ask: a link could try to send health data somewhere else.
        AlertDialog.Builder(this)
            .setTitle(R.string.confirm_title)
            .setMessage(getString(R.string.confirm_text, target.host))
            .setPositiveButton(R.string.connect) { _, _ ->
                prefs.url = url
                prefs.key = key
                prefs.lastSync = 0L
                SyncWorker.schedule(this)
                askPermissions()
                refresh()
            }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
        setIntent(Intent(this, MainActivity::class.java))
    }

    private fun askPermissions() {
        when (HealthConnectClient.getSdkStatus(this)) {
            HealthConnectClient.SDK_AVAILABLE -> requestPermissions.launch(permissions)
            HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> startActivity(
                Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=com.google.android.apps.healthdata")),
            )
            else -> detail.text = getString(R.string.hc_missing)
        }
    }

    private fun refresh() {
        lifecycleScope.launch {
            val connected = prefs.isConnected
            val available = HealthConnectClient.getSdkStatus(this@MainActivity) == HealthConnectClient.SDK_AVAILABLE
            val granted = if (available) {
                HealthConnectClient.getOrCreate(this@MainActivity).permissionController.getGrantedPermissions()
            } else {
                emptySet()
            }
            val hasData = HealthPermission.getReadPermission(StepsRecord::class) in granted ||
                HealthPermission.getReadPermission(WeightRecord::class) in granted
            val missing = permissions - granted
            status.text = when {
                !connected -> getString(R.string.not_connected)
                !hasData -> getString(R.string.needs_access)
                else -> getString(R.string.all_good)
            }
            status.setTextColor(if (connected && hasData) Color.rgb(21, 128, 61) else Color.rgb(194, 65, 12))
            val last = prefs.lastSync
            detail.text = listOfNotNull(
                if (last > 0) getString(R.string.last_sync, DateUtils.getRelativeTimeSpanString(last)) else null,
                prefs.lastMessage,
                if (!connected) getString(R.string.how_to_connect) else null,
                // Added in 1.1: phones set up earlier have not granted meals yet.
                if (connected && hasData && HealthPermission.getReadPermission(NutritionRecord::class) in missing) getString(R.string.meals_access) else null,
            ).joinToString("\n")
            allow.isEnabled = connected
            sync.isEnabled = connected && hasData
        }
    }

    private fun startBws() {
        val problem = BwsSync.start(this)
        if (problem == null) {
            Toast.makeText(this, R.string.bws_starting, Toast.LENGTH_LONG).show()
        } else {
            bwsStatus.text = problem
            Toast.makeText(this, problem, Toast.LENGTH_LONG).show()
        }
    }

    /** Build With Science on this phone: off until the person turns on the accessibility service. */
    private fun refreshBws() {
        val on = BwsService.isEnabled(this)
        val last = prefs.bwsLast
        bwsStatus.text = listOfNotNull(
            if (on) getString(R.string.bws_ready) else getString(R.string.bws_explain),
            if (!on) getString(R.string.bws_restricted_hint) else null,
            if (last > 0) getString(R.string.bws_last, DateUtils.getRelativeTimeSpanString(last), prefs.bwsMessage.orEmpty()) else null,
        ).joinToString("\n\n")
        bwsTurnOn.visibility = if (on) android.view.View.GONE else android.view.View.VISIBLE
        bwsRestricted.visibility = bwsTurnOn.visibility
        bwsSync.isEnabled = on && prefs.isConnected
        val minutes = prefs.bwsReminder
        bwsReminder.text = if (minutes < 0) getString(R.string.bws_reminder_off) else getString(R.string.bws_reminder_on, "%02d:%02d".format(minutes / 60, minutes % 60))
        bwsReminder.isEnabled = on
    }

    private fun pickReminder() {
        if (prefs.bwsReminder >= 0) {
            prefs.bwsReminder = -1
            BwsReminder.schedule(this, -1)
            refreshBws()
            return
        }
        TimePickerDialog(this, { _, hour, minute ->
            prefs.bwsReminder = hour * 60 + minute
            BwsReminder.schedule(this, prefs.bwsReminder)
            if (Build.VERSION.SDK_INT >= 33) askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
            refreshBws()
        }, 20, 0, true).show()
    }

    private fun buildUi(): ScrollView {
        val pad = (20 * resources.displayMetrics.density).toInt()
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad * 2, pad, pad)
            setBackgroundColor(Color.rgb(250, 247, 242))
        }
        fun text(size: Float, bold: Boolean = false, color: Int = Color.rgb(28, 25, 23)) = TextView(this).apply {
            textSize = size
            setTextColor(color)
            if (bold) typeface = Typeface.DEFAULT_BOLD
            setPadding(0, pad / 3, 0, pad / 3)
        }
        column.addView(text(30f, bold = true, color = Color.rgb(194, 65, 12)).apply { text = getString(R.string.app_name) })
        column.addView(text(17f, color = Color.rgb(87, 83, 78)).apply { text = getString(R.string.intro) })
        status = text(20f, bold = true)
        detail = text(16f, color = Color.rgb(87, 83, 78))
        column.addView(status)
        column.addView(detail)
        allow = Button(this).apply {
            text = getString(R.string.allow_access)
            textSize = 18f
            setOnClickListener { askPermissions() }
        }
        sync = Button(this).apply {
            text = getString(R.string.sync_now)
            textSize = 18f
            setOnClickListener {
                detail.text = getString(R.string.syncing)
                SyncWorker.syncNow(this@MainActivity)
            }
        }
        column.addView(allow, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT).apply { topMargin = pad })
        column.addView(sync, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
        column.addView(text(14f, color = Color.rgb(120, 113, 108)).apply {
            text = getString(R.string.eufy_hint)
            gravity = Gravity.START
        })

        // Build With Science workouts, read on this phone (no computer needed).
        column.addView(text(22f, bold = true).apply {
            text = getString(R.string.bws_title)
            setPadding(0, pad * 2, 0, pad / 3)
        })
        bwsStatus = text(16f, color = Color.rgb(87, 83, 78))
        column.addView(bwsStatus)
        fun button(label: Int, action: () -> Unit) = Button(this).apply {
            text = getString(label)
            textSize = 18f
            setOnClickListener { action() }
        }
        bwsTurnOn = button(R.string.bws_open_settings) { startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) }
        bwsRestricted = button(R.string.bws_app_info) {
            startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")))
        }
        bwsSync = button(R.string.bws_sync) { startBws() }
        bwsReminder = button(R.string.bws_reminder_off) { pickReminder() }
        for (b in listOf(bwsTurnOn, bwsRestricted, bwsSync, bwsReminder)) column.addView(b, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
        return ScrollView(this).apply { addView(column) }
    }
}
