package app.forza.health

import android.content.Context

/** Connection settings and the last sync result, kept in the app's private storage. */
class Prefs(context: Context) {
    private val prefs = context.getSharedPreferences("forza", Context.MODE_PRIVATE)

    var url: String?
        get() = prefs.getString("url", null)
        set(value) = prefs.edit().putString("url", value).apply()

    var key: String?
        get() = prefs.getString("key", null)
        set(value) = prefs.edit().putString("key", value).apply()

    var lastSync: Long
        get() = prefs.getLong("last_sync", 0L)
        set(value) = prefs.edit().putLong("last_sync", value).apply()

    var lastMessage: String?
        get() = prefs.getString("last_message", null)
        set(value) = prefs.edit().putString("last_message", value).apply()

    val isConnected: Boolean
        get() = !url.isNullOrBlank() && !key.isNullOrBlank()
}
