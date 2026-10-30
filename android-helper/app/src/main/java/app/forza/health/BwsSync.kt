package app.forza.health

import android.annotation.SuppressLint
import android.app.KeyguardManager
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * One Build With Science sync on this phone, without a computer:
 *  1. asks Forza! which workouts it already has (bws-ingest, "status");
 *  2. runs the shared extractor (assets/bws, copied from coach/lib) in a hidden page, with the
 *     accessibility service as its hands and eyes, while a banner says what is happening;
 *  3. sends what was read (bws-ingest, "import") and goes back to the home screen.
 * The phone must stay unlocked; tapping the banner, locking the phone or opening another app stops it.
 */
object BwsSync {
    private const val TAG = "ForzaBws"
    private const val ORIGIN = "appassets.androidplatform.net"
    private const val PLAN_EVERY_MS = 20 * 60 * 60 * 1000L
    private const val TIMEOUT_MS = 30 * 60 * 1000L

    @Volatile
    var running = false
        private set

    @Volatile
    private var cancelled = false

    private val main = Handler(Looper.getMainLooper())
    private var web: WebView? = null

    /** Starts a sync; returns why it cannot start, or null when it started. */
    fun start(context: Context): String? {
        val app = context.applicationContext
        val prefs = Prefs(app)
        val service = BwsService.instance
        return when {
            running -> app.getString(R.string.bws_already)
            !prefs.isConnected -> app.getString(R.string.not_connected)
            Build.VERSION.SDK_INT < 30 -> app.getString(R.string.bws_android_old)
            service == null -> app.getString(R.string.bws_turn_on)
            app.packageManager.getLaunchIntentForPackage(BwsService.BWS) == null -> app.getString(R.string.bws_not_installed)
            app.getSystemService(KeyguardManager::class.java).isKeyguardLocked -> app.getString(R.string.bws_unlock)
            else -> {
                running = true
                cancelled = false
                Thread { prepare(app, prefs, service) }.start()
                null
            }
        }
    }

    private fun prepare(app: Context, prefs: Prefs, service: BwsService) {
        try {
            val status = post(prefs, JSONObject().put("action", "status").put("utc_offset_min", utcOffsetMinutes()))
            val planDue = System.currentTimeMillis() - prefs.bwsPlanAt > PLAN_EVERY_MS
            val config = JSONObject()
                .put("imported", status.optJSONArray("imported"))
                .put("recent", status.optJSONArray("recent"))
                .put("plan", planDue)
                .put("previousPlan", prefs.bwsPlan?.let { JSONObject(it) } ?: JSONObject.NULL)
                .put("food", status.optJSONObject("food") ?: JSONObject.NULL)
            main.post { open(app, prefs, service, config.toString(), planDue) }
        } catch (e: Exception) {
            finish(app, prefs, service, app.getString(R.string.bws_failed, e.message ?: "?"))
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun open(app: Context, prefs: Prefs, service: BwsService, config: String, planDue: Boolean) {
        val page = WebView(service)
        web = page
        page.settings.javaScriptEnabled = true
        page.settings.allowFileAccess = false
        page.webViewClient = object : WebViewClient() {
            // Only the pages packed in the app: nothing else is ever loaded in this page.
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse {
                val uri = request.url
                val name = uri.path?.removePrefix("/")
                if (uri.host != ORIGIN || name == null || !name.startsWith("bws/") || name.contains("..")) {
                    return WebResourceResponse("text/plain", "utf-8", 404, "Not found", emptyMap(), null)
                }
                val mime = when (name.substringAfterLast('.')) {
                    "html" -> "text/html"
                    "mjs", "js" -> "text/javascript"
                    "json" -> "application/json"
                    else -> "text/plain"
                }
                return runCatching { WebResourceResponse(mime, "utf-8", app.assets.open(name)) }
                    .getOrElse { WebResourceResponse("text/plain", "utf-8", 404, "Not found", emptyMap(), null) }
            }

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest) = true
        }
        page.addJavascriptInterface(Bridge(app, prefs, service, config, planDue), "ForzaBws")
        service.showBanner(app.getString(R.string.bws_banner), page) {
            cancelled = true
            service.updateBanner(app.getString(R.string.bws_stopping))
        }
        page.loadUrl("https://$ORIGIN/bws/index.html")
        main.postDelayed({ if (running) finish(app, prefs, service, app.getString(R.string.bws_timeout)) }, TIMEOUT_MS)
    }

    private fun finish(app: Context, prefs: Prefs, service: BwsService, message: String) {
        main.post {
            if (!running) return@post
            running = false
            main.removeCallbacksAndMessages(null)
            service.hideBanner()
            web?.destroy()
            web = null
            prefs.bwsMessage = message
            prefs.bwsLast = System.currentTimeMillis()
            Thread { service.home() }.start()
            Toast.makeText(app, message, Toast.LENGTH_LONG).show()
        }
    }

    /** Minutes ahead of UTC here (60 in Italy in winter): the server needs it to tell days apart. */
    fun utcOffsetMinutes(): Int = java.util.TimeZone.getDefault().getOffset(System.currentTimeMillis()) / 60_000

    /** Posts to the bws-ingest function next to health-ingest, with the same sync key. */
    private fun post(prefs: Prefs, body: JSONObject): JSONObject {
        val url = Uri.parse(prefs.url).buildUpon().path(Uri.parse(prefs.url).path?.replace("health-ingest", "bws-ingest")).build().toString()
        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 15_000
            readTimeout = 120_000
            doOutput = true
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("x-forza-token", prefs.key)
        }
        try {
            conn.outputStream.use { it.write(body.toString().toByteArray()) }
            val code = conn.responseCode
            val text = (if (code in 200..299) conn.inputStream else conn.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
            if (code !in 200..299) throw IllegalStateException("HTTP $code ${text.take(200)}")
            return JSONObject(text)
        } finally {
            conn.disconnect()
        }
    }

    /** What the page can ask for: the accessibility service's "device" methods, and the run's input and output. */
    private class Bridge(
        private val app: Context,
        private val prefs: Prefs,
        private val service: BwsService,
        private val config: String,
        private val planDue: Boolean,
    ) {
        @JavascriptInterface fun config(): String = config
        @JavascriptInterface fun info(): String = service.screen().toString()
        @JavascriptInterface fun dump(): String = service.nodes() ?: ""
        @JavascriptInterface fun tap(x: Int, y: Int) { service.tap(x, y) }
        @JavascriptInterface fun swipe(x1: Int, y1: Int, x2: Int, y2: Int, ms: Int) { service.swipe(x1, y1, x2, y2, ms) }
        @JavascriptInterface fun back() { service.back() }
        @JavascriptInterface fun launch(pkg: String) { if (pkg == BwsService.BWS) service.launch(pkg) }
        @JavascriptInterface fun foreground(): String = service.foreground().toString()
        @JavascriptInterface fun screenshot(): Boolean = service.screenshot()
        @JavascriptInterface fun rgb(x: Int, y: Int): String = service.rgb(x, y)
        @JavascriptInterface fun cancelled(): Boolean = cancelled

        @JavascriptInterface fun log(text: String) {
            Log.i(TAG, text)
        }

        @JavascriptInterface fun progress(read: Int) {
            service.updateBanner(app.getString(R.string.bws_progress, read))
        }

        @JavascriptInterface fun done(result: String) {
            service.updateBanner(app.getString(R.string.bws_sending))
            Thread {
                val message = try {
                    val r = JSONObject(result)
                    val imported = post(prefs, JSONObject().put("action", "import").put("utc_offset_min", utcOffsetMinutes()).put("file", r.getJSONObject("file")))
                    if (planDue && !r.isNull("plan")) {
                        prefs.bwsPlan = r.getJSONObject("plan").toString()
                        prefs.bwsPlanAt = System.currentTimeMillis()
                    }
                    app.getString(R.string.bws_done, imported.optInt("sessions"), imported.optInt("food"))
                } catch (e: Exception) {
                    app.getString(R.string.bws_failed, e.message ?: "?")
                }
                finish(app, prefs, service, message)
            }.start()
        }

        @JavascriptInterface fun fail(message: String) {
            Log.w(TAG, message)
            finish(app, prefs, service, if (cancelled) app.getString(R.string.bws_stopped) else app.getString(R.string.bws_failed, message))
        }
    }
}
