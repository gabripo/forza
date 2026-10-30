package app.forza.health

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * For maintainers adapting the extractor to a new version of Build With Science: prints what the
 * accessibility service sees on screen to the phone's log. Only ADB can send it (it needs the DUMP
 * permission, which apps cannot have):
 *   adb shell am broadcast -a app.forza.health.BWS_DUMP -n app.forza.health/.BwsDumpReceiver
 *   adb logcat -s ForzaBwsDump
 */
class BwsDumpReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val nodes = BwsService.instance?.nodes() ?: "[] (the accessibility service is off)"
        nodes.chunked(3000).forEachIndexed { i, part -> Log.i("ForzaBwsDump", "$i/$part") }
        Log.i("ForzaBwsDump", "end")
    }
}
