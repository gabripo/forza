package app.forza.health

import android.app.AlertDialog
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Bundle
import android.text.format.DateUtils
import android.view.Gravity
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContract
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.BodyFatRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
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
        HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND,
        HealthPermission.PERMISSION_READ_HEALTH_DATA_HISTORY,
    )

    private val contract: ActivityResultContract<Set<String>, Set<String>> =
        PermissionController.createRequestPermissionResultContract()
    private val requestPermissions = registerForActivityResult(contract) { granted ->
        if (granted.isNotEmpty()) SyncWorker.syncNow(this)
        refresh()
    }

    private lateinit var prefs: Prefs
    private lateinit var status: TextView
    private lateinit var detail: TextView
    private lateinit var allow: Button
    private lateinit var sync: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = Prefs(this)
        setContentView(buildUi())
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
    }

    private fun handleSetupLink(intent: Intent?) {
        val uri: Uri = intent?.data ?: return
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
            ).joinToString("\n")
            allow.isEnabled = connected
            sync.isEnabled = connected && hasData
        }
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
        return ScrollView(this).apply { addView(column) }
    }
}
