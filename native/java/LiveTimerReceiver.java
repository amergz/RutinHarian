package com.rutinharian.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Rebuilds a live timer notification when its next stage/target time arrives. */
public class LiveTimerReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent != null ? intent.getAction() : null;
        if (Intent.ACTION_BOOT_COMPLETED.equals(action)
                || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            LiveTimerNotifier.renderAll(context);
            return;
        }
        String key = intent != null ? intent.getStringExtra("key") : null;
        if (key != null) LiveTimerNotifier.render(context, key);
    }
}
