package app.forza.health

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.util.Calendar
import java.util.concurrent.TimeUnit

/**
 * A daily notification: "Time to bring over today's workouts". Tapping it starts the sync on this
 * phone (the person then leaves the phone unlocked for a couple of minutes).
 */
class BwsReminder(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        notify(applicationContext)
        return Result.success()
    }

    companion object {
        private const val WORK = "forza-bws-reminder"
        private const val CHANNEL = "bws"

        /** Schedules (or cancels, with -1) the reminder at this time of day, in minutes after midnight. */
        fun schedule(context: Context, minutes: Int) {
            val work = WorkManager.getInstance(context)
            if (minutes < 0) {
                work.cancelUniqueWork(WORK)
                return
            }
            val now = Calendar.getInstance()
            val next = (now.clone() as Calendar).apply {
                set(Calendar.HOUR_OF_DAY, minutes / 60)
                set(Calendar.MINUTE, minutes % 60)
                set(Calendar.SECOND, 0)
                if (!after(now)) add(Calendar.DAY_OF_MONTH, 1)
            }
            val request = PeriodicWorkRequestBuilder<BwsReminder>(1, TimeUnit.DAYS)
                .setInitialDelay(next.timeInMillis - now.timeInMillis, TimeUnit.MILLISECONDS)
                .build()
            work.enqueueUniquePeriodicWork(WORK, ExistingPeriodicWorkPolicy.UPDATE, request)
        }

        fun notify(context: Context) {
            if (Build.VERSION.SDK_INT >= 33 &&
                context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
            ) {
                return
            }
            val manager = context.getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(
                NotificationChannel(CHANNEL, context.getString(R.string.bws_channel), NotificationManager.IMPORTANCE_DEFAULT),
            )
            val open = PendingIntent.getActivity(
                context,
                0,
                Intent(Intent.ACTION_VIEW, Uri.parse("forzahealth://bws"), context, MainActivity::class.java),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
            val notification = android.app.Notification.Builder(context, CHANNEL)
                .setSmallIcon(R.drawable.ic_launcher_foreground)
                .setContentTitle(context.getString(R.string.bws_reminder_title))
                .setContentText(context.getString(R.string.bws_reminder_text))
                .setStyle(android.app.Notification.BigTextStyle().bigText(context.getString(R.string.bws_reminder_text)))
                .setContentIntent(open)
                .setAutoCancel(true)
                .build()
            manager.notify(7, notification)
        }
    }
}
