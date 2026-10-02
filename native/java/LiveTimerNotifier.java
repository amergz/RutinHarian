package com.rutinharian.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.os.SystemClock;
import android.view.View;
import android.widget.RemoteViews;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.Set;

/**
 * Builds the ongoing "live timer" notification.
 *
 * The time is shown with a Chronometer inside a custom RemoteViews layout,
 * so Android itself ticks the clock every second. No foreground service and
 * no per-second wake-ups are needed, which keeps battery use near zero.
 *
 * Stage text (e.g. "Metabolic Switch") changes at known timestamps, so an
 * alarm is scheduled for the next change and the notification is rebuilt
 * then (LiveTimerReceiver). Timer data lives in SharedPreferences so the
 * notification can be restored after a reboot.
 */
public final class LiveTimerNotifier {

    static final String CHANNEL_ID = "live_timer";
    static final String ACTION_TICK = "com.rutinharian.app.LIVE_TIMER_TICK";
    private static final String PREFS = "live_timer_store";

    private LiveTimerNotifier() {}

    /* ---------------- storage ---------------- */

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static void save(Context c, String key, String json) {
        prefs(c).edit().putString(key, json).apply();
    }

    static Set<String> keys(Context c) {
        return new HashSet<>(prefs(c).getAll().keySet());
    }

    /* ---------------- channel ---------------- */

    static void ensureChannel(Context c) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null || nm.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID, "Live timer", NotificationManager.IMPORTANCE_LOW);
        ch.setDescription("Ongoing fasting and activity timers");
        ch.setShowBadge(false);
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(ch);
    }

    /* ---------------- public API ---------------- */

    static void stop(Context c, String key) {
        String raw = prefs(c).getString(key, null);
        int id = 7000;
        if (raw != null) {
            try { id = new JSONObject(raw).optInt("notificationId", 7000); }
            catch (JSONException ignored) {}
        }
        prefs(c).edit().remove(key).apply();
        cancelAlarm(c, key, id);
        NotificationManagerCompat.from(c).cancel(id);
    }

    static void renderAll(Context c) {
        for (String k : keys(c)) render(c, k);
    }

    @SuppressLint("MissingPermission")
    static void render(Context c, String key) {
        String raw = prefs(c).getString(key, null);
        if (raw == null) return;

        JSONObject o;
        try { o = new JSONObject(raw); }
        catch (JSONException e) { prefs(c).edit().remove(key).apply(); return; }

        ensureChannel(c);

        final int id         = o.optInt("notificationId", 7000);
        final String mode    = o.optString("mode", "countdown");
        final long now       = System.currentTimeMillis();
        final long startTs   = o.optLong("startTs", now);
        final long targetTs  = o.optLong("targetTs", 0L);
        final boolean isDown = "countdown".equals(mode) && targetTs > 0;
        final boolean done   = isDown && now >= targetTs;

        /* Stage text: last stage whose time has passed. */
        String text  = o.optString("text", "");
        String emoji = o.optString("emoji", "⏱");
        long nextChange = Long.MAX_VALUE;
        JSONArray stages = o.optJSONArray("stages");
        if (stages != null) {
            for (int i = 0; i < stages.length(); i++) {
                JSONObject s = stages.optJSONObject(i);
                if (s == null) continue;
                long at = s.optLong("at", 0L);
                if (at <= now) {
                    text  = s.optString("text", text);
                    emoji = s.optString("emoji", emoji);
                } else if (at < nextChange) {
                    nextChange = at;
                }
            }
        }

        boolean countDown;
        long base;
        String format;
        String sub;
        if (done) {
            countDown = false;
            base      = startTs;
            format    = o.optString("completeFormat", "%s");
            sub       = o.optString("completeSub", o.optString("sub", ""));
            String ce = o.optString("completeEmoji", "");
            if (!ce.isEmpty()) emoji = ce;
        } else if (isDown) {
            countDown = true;
            base      = targetTs;
            format    = o.optString("format", "%s");
            sub       = o.optString("sub", "");
            if (targetTs < nextChange) nextChange = targetTs;
        } else {
            countDown = false;
            base      = startTs;
            format    = o.optString("format", "%s");
            sub       = o.optString("sub", "");
        }

        /* Convert wall-clock base to the elapsedRealtime timebase. */
        long chronoBase = SystemClock.elapsedRealtime() + (base - now);

        RemoteViews small = buildViews(c, chronoBase, countDown, format, text, sub, emoji);
        RemoteViews big   = buildViews(c, chronoBase, countDown, format, text, sub, emoji);

        Intent open = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
        if (open == null) open = new Intent(c, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent content = PendingIntent.getActivity(
                c, id, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_timer)
                .setContentTitle(o.optString("title", "Rutin Harian"))
                .setContentText(text)
                .setStyle(new NotificationCompat.DecoratedCustomViewStyle())
                .setCustomContentView(small)
                .setCustomBigContentView(big)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setSilent(true)
                .setShowWhen(false)
                .setContentIntent(content)
                .setCategory(NotificationCompat.CATEGORY_PROGRESS)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setPriority(NotificationCompat.PRIORITY_LOW);

        String color = o.optString("color", "");
        if (!color.isEmpty()) {
            try { b.setColor(Color.parseColor(color)); }
            catch (IllegalArgumentException ignored) {}
        }

        if (nextChange != Long.MAX_VALUE) scheduleAlarm(c, key, id, nextChange + 1000L);
        else cancelAlarm(c, key, id);

        if (!canPost(c)) return;
        try {
            NotificationManagerCompat.from(c).notify(id, b.build());
        } catch (SecurityException ignored) {
            /* Permission revoked between check and post. */
        }
    }

    /* ---------------- helpers ---------------- */

    private static RemoteViews buildViews(Context c, long chronoBase, boolean countDown,
                                          String format, String text, String sub, String emoji) {
        RemoteViews rv = new RemoteViews(c.getPackageName(), R.layout.live_timer_notification);
        rv.setChronometerCountDown(R.id.lt_chrono, countDown);
        rv.setChronometer(R.id.lt_chrono, chronoBase, format, true);
        rv.setTextViewText(R.id.lt_text, text);
        rv.setViewVisibility(R.id.lt_text, text.isEmpty() ? View.GONE : View.VISIBLE);
        rv.setTextViewText(R.id.lt_sub, sub);
        rv.setViewVisibility(R.id.lt_sub, sub.isEmpty() ? View.GONE : View.VISIBLE);
        rv.setTextViewText(R.id.lt_emoji, emoji);
        return rv;
    }

    private static boolean canPost(Context c) {
        if (Build.VERSION.SDK_INT >= 33 &&
                ContextCompat.checkSelfPermission(c, Manifest.permission.POST_NOTIFICATIONS)
                        != PackageManager.PERMISSION_GRANTED) {
            return false;
        }
        return NotificationManagerCompat.from(c).areNotificationsEnabled();
    }

    private static PendingIntent alarmIntent(Context c, String key, int id, int flags) {
        Intent i = new Intent(c, LiveTimerReceiver.class);
        i.setAction(ACTION_TICK);
        i.putExtra("key", key);
        return PendingIntent.getBroadcast(c, 90000 + id, i, flags | PendingIntent.FLAG_IMMUTABLE);
    }

    private static void scheduleAlarm(Context c, String key, int id, long at) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        PendingIntent pi = alarmIntent(c, key, id, PendingIntent.FLAG_UPDATE_CURRENT);
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms()) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            } else {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            }
        } catch (SecurityException e) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        }
    }

    private static void cancelAlarm(Context c, String key, int id) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        PendingIntent pi = alarmIntent(c, key, id, PendingIntent.FLAG_NO_CREATE);
        if (am != null && pi != null) {
            am.cancel(pi);
            pi.cancel();
        }
    }
}
