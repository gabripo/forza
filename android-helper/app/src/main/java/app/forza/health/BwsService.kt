package app.forza.health

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.app.ActivityManager
import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Path
import android.graphics.PixelFormat
import android.graphics.Rect
import android.os.Build
import android.provider.Settings
import android.util.TypedValue
import android.view.Display
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.FrameLayout
import android.widget.TextView
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Reads Build With Science on this phone, for people without a computer next to it. While a sync runs
 * (and only then: see BwsSync) it reads the screen, taps and scrolls like a person would, exactly what
 * Forza! Coach does over a cable. It listens only to Build With Science and never taps Start, Edit,
 * Delete or Log (the refusal is in the shared extractor).
 */
class BwsService : AccessibilityService() {

    companion object {
        const val BWS = "com.bws.appv2"

        @Volatile
        var instance: BwsService? = null
            private set

        /** True when the person turned the service on in the phone's accessibility settings. */
        fun isEnabled(context: Context): Boolean {
            val enabled = Settings.Secure.getString(context.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: return false
            val full = "${context.packageName}/${BwsService::class.java.name}"
            val short = "${context.packageName}/.${BwsService::class.java.simpleName}"
            return enabled.split(':').any { it.equals(full, ignoreCase = true) || it.equals(short, ignoreCase = true) }
        }
    }

    private var shot: Bitmap? = null
    private var banner: FrameLayout? = null
    private var bannerText: TextView? = null

    override fun onServiceConnected() {
        instance = this
    }

    override fun onUnbind(intent: Intent?): Boolean {
        instance = null
        return super.onUnbind(intent)
    }

    override fun onDestroy() {
        instance = null
        hideBanner()
        super.onDestroy()
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) = Unit

    override fun onInterrupt() = Unit

    // ------------------------------------------------------------------------------------------
    // The "device" of the shared extractor (same methods as coach/lib/adb.mjs)
    // ------------------------------------------------------------------------------------------

    fun screen(): JSONObject {
        val wm = getSystemService(WindowManager::class.java)
        val (w, h) = if (Build.VERSION.SDK_INT >= 30) {
            wm.maximumWindowMetrics.bounds.let { it.width() to it.height() }
        } else {
            @Suppress("DEPRECATION")
            android.util.DisplayMetrics().also { wm.defaultDisplay.getRealMetrics(it) }.let { it.widthPixels to it.heightPixels }
        }
        return JSONObject().put("width", w).put("height", h).put("density", resources.displayMetrics.densityDpi)
    }

    /** Visible texts with their position, like `uiautomator dump`: [{ x, y, top, bottom, label, click }]. */
    fun nodes(): String? {
        val root = rootInActiveWindow ?: return null
        val size = screen()
        val screenRect = Rect(0, 0, size.getInt("width"), size.getInt("height"))
        val out = JSONArray()
        fun walk(node: AccessibilityNodeInfo) {
            val label = node.text?.toString()?.trim().orEmpty().ifEmpty { node.contentDescription?.toString()?.trim().orEmpty() }
            if (label.isNotEmpty()) {
                val r = Rect()
                node.getBoundsInScreen(r)
                if (r.intersect(screenRect)) {
                    out.put(
                        JSONObject()
                            .put("x", (r.left + r.right) / 2).put("y", (r.top + r.bottom) / 2)
                            .put("top", r.top).put("bottom", r.bottom)
                            .put("label", label).put("click", node.isClickable),
                    )
                }
            }
            for (i in 0 until node.childCount) {
                val child = node.getChild(i) ?: continue
                if (child.isVisibleToUser) walk(child)
            }
        }
        walk(root)
        return out.toString()
    }

    fun tap(x: Int, y: Int): Boolean = gesture(Path().apply { moveTo(x.toFloat(), y.toFloat()) }, 60)

    fun swipe(x1: Int, y1: Int, x2: Int, y2: Int, ms: Int): Boolean =
        gesture(Path().apply { moveTo(x1.toFloat(), y1.toFloat()); lineTo(x2.toFloat(), y2.toFloat()) }, ms.coerceIn(50, 5000).toLong())

    private fun gesture(path: Path, ms: Long): Boolean {
        val done = CountDownLatch(1)
        var ok = false
        val stroke = GestureDescription.StrokeDescription(path, 0, ms)
        val started = dispatchGesture(
            GestureDescription.Builder().addStroke(stroke).build(),
            object : GestureResultCallback() {
                override fun onCompleted(gestureDescription: GestureDescription?) {
                    ok = true
                    done.countDown()
                }

                override fun onCancelled(gestureDescription: GestureDescription?) = done.countDown()
            },
            null,
        )
        if (started) done.await(ms + 3000, TimeUnit.MILLISECONDS)
        return ok
    }

    fun back() = performGlobalAction(GLOBAL_ACTION_BACK)

    fun home() = performGlobalAction(GLOBAL_ACTION_HOME)

    /** Restarts Build With Science on its home screen (like swiping it away and opening it again). */
    fun launch(pkg: String) {
        home()
        Thread.sleep(800)
        getSystemService(ActivityManager::class.java).killBackgroundProcesses(pkg)
        Thread.sleep(800)
        val intent = packageManager.getLaunchIntentForPackage(pkg) ?: return
        startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK))
    }

    /** The app in front, and whether the phone is locked. */
    fun foreground(): JSONObject = JSONObject()
        .put("locked", getSystemService(KeyguardManager::class.java).isKeyguardLocked)
        .put("focus", rootInActiveWindow?.packageName?.toString() ?: JSONObject.NULL)

    /** Takes a screenshot, kept for rgb(): Android allows about one a second, so busy ones are retried. */
    fun screenshot(): Boolean {
        if (Build.VERSION.SDK_INT < 30) return false
        repeat(4) {
            val done = CountDownLatch(1)
            var bitmap: Bitmap? = null
            takeScreenshot(
                Display.DEFAULT_DISPLAY,
                mainExecutor,
                object : TakeScreenshotCallback {
                    override fun onSuccess(result: ScreenshotResult) {
                        val hardware = Bitmap.wrapHardwareBuffer(result.hardwareBuffer, result.colorSpace)
                        bitmap = hardware?.copy(Bitmap.Config.ARGB_8888, false)
                        hardware?.recycle()
                        result.hardwareBuffer.close()
                        done.countDown()
                    }

                    override fun onFailure(errorCode: Int) = done.countDown()
                },
            )
            done.await(5, TimeUnit.SECONDS)
            bitmap?.let {
                shot?.recycle()
                shot = it
                return true
            }
            Thread.sleep(1100)
        }
        return false
    }

    /** Average colour of the 9×9 pixels around a point of the last screenshot, as "[r,g,b]". */
    fun rgb(x: Int, y: Int): String {
        val b = shot ?: return "[0,0,0]"
        var r = 0
        var g = 0
        var bl = 0
        var n = 0
        for (dx in -4..4) for (dy in -4..4) {
            val c = b.getPixel((x + dx).coerceIn(0, b.width - 1), (y + dy).coerceIn(0, b.height - 1))
            r += Color.red(c)
            g += Color.green(c)
            bl += Color.blue(c)
            n++
        }
        return "[${r / n},${g / n},${bl / n}]"
    }

    // ------------------------------------------------------------------------------------------
    // A thin banner over the status bar while a sync runs: what is happening, and tap to stop.
    // ------------------------------------------------------------------------------------------

    fun showBanner(text: String, extra: View? = null, onTap: () -> Unit) {
        hideBanner()
        val statusBar = resources.getIdentifier("status_bar_height", "dimen", "android").let { if (it > 0) resources.getDimensionPixelSize(it) else 0 }
        val minHeight = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, 28f, resources.displayMetrics).toInt()
        val label = TextView(this).apply {
            this.text = text
            setTextColor(Color.WHITE)
            textSize = 12f
            gravity = Gravity.CENTER
            setSingleLine(true)
        }
        val frame = FrameLayout(this).apply {
            setBackgroundColor(Color.rgb(194, 65, 12))
            setOnClickListener { onTap() }
            // The page that runs the extractor lives here, out of sight, so the system keeps it running.
            extra?.let { addView(it, FrameLayout.LayoutParams(1, 1)) }
            addView(label, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        }
        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            maxOf(statusBar, minHeight),
            WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
            PixelFormat.TRANSLUCENT,
        ).apply { gravity = Gravity.TOP }
        getSystemService(WindowManager::class.java).addView(frame, params)
        banner = frame
        bannerText = label
    }

    fun updateBanner(text: String) {
        bannerText?.post { bannerText?.text = text }
    }

    fun hideBanner() {
        banner?.let { runCatching { getSystemService(WindowManager::class.java).removeView(it) } }
        banner = null
        bannerText = null
    }
}
