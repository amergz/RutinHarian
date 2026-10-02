package com.rutinharian.app;

import android.content.Context;

import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * JS API (via window.Capacitor.Plugins.LiveTimer):
 *
 *   start({ key, notificationId, mode: "countdown" | "countup",
 *           startTs, targetTs, title, format, completeFormat,
 *           text, sub, completeSub, emoji, completeEmoji, color,
 *           stages: [{ at, text, emoji }] })
 *   stop({ key })
 *   stopAll()
 */
@CapacitorPlugin(name = "LiveTimer")
public class LiveTimerPlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        String key = call.getString("key");
        if (key == null || key.isEmpty()) {
            call.reject("key is required");
            return;
        }
        Context c = getContext();
        LiveTimerNotifier.ensureChannel(c);
        LiveTimerNotifier.save(c, key, call.getData().toString());
        LiveTimerNotifier.render(c, key);

        JSObject ret = new JSObject();
        ret.put("enabled", NotificationManagerCompat.from(c).areNotificationsEnabled());
        call.resolve(ret);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        String key = call.getString("key");
        if (key != null && !key.isEmpty()) LiveTimerNotifier.stop(getContext(), key);
        call.resolve();
    }

    @PluginMethod
    public void stopAll(PluginCall call) {
        Context c = getContext();
        for (String k : LiveTimerNotifier.keys(c)) LiveTimerNotifier.stop(c, k);
        call.resolve();
    }
}
