package app.forza.health

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** After an update of this app, apply the current sync schedule without waiting for it to be opened. */
class UpdateReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_MY_PACKAGE_REPLACED && Prefs(context).isConnected) SyncWorker.schedule(context)
    }
}
