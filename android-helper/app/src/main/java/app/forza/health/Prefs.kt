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

    /** True after the first meal sync (which reads 90 days; later ones read 14). */
    var mealsSynced: Boolean
        get() = prefs.getBoolean("meals_synced", false)
        set(value) = prefs.edit().putBoolean("meals_synced", value).apply()

    /** Build With Science on this phone: the last result, when it ran, and the plan read last time. */
    var bwsMessage: String?
        get() = prefs.getString("bws_message", null)
        set(value) = prefs.edit().putString("bws_message", value).apply()

    var bwsLast: Long
        get() = prefs.getLong("bws_last", 0L)
        set(value) = prefs.edit().putLong("bws_last", value).apply()

    var bwsPlan: String?
        get() = prefs.getString("bws_plan", null)
        set(value) = prefs.edit().putString("bws_plan", value).apply()

    var bwsPlanAt: Long
        get() = prefs.getLong("bws_plan_at", 0L)
        set(value) = prefs.edit().putLong("bws_plan_at", value).apply()

    /** Daily reminder to sync Build With Science, as minutes after midnight; -1 when off. */
    var bwsReminder: Int
        get() = prefs.getInt("bws_reminder", -1)
        set(value) = prefs.edit().putInt("bws_reminder", value).apply()

    val isConnected: Boolean
        get() = !url.isNullOrBlank() && !key.isNullOrBlank()
}
