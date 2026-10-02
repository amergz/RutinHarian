/* =========================================================
   native.js — Android (Capacitor) integration layer
   ---------------------------------------------------------
   Everything here is a no-op in a normal browser, so the web
   prototype keeps working exactly as before.

   In the Android app it adds:
   1. Live timer notification (fasting countdown + activity
      stopwatch) via the local LiveTimer plugin.
   2. System reminders that fire even when the app is closed
      (LocalNotifications), with action buttons.
   3. Hardware back button: closes sheets → goes to Today → minimises.
   4. Haptic feedback on taps.
   5. Status bar style follows the light/dark theme.
   6. Backup export through the Android share sheet.
   7. Refresh on resume (day rollover, timers).

   Hook point: Storage.saveState is wrapped, so ANY change to
   state (fast started/ended, timer started, reminder edited…)
   triggers a debounced sync. No other module needs to call us.
   ========================================================= */

const Native = (() => {
  "use strict";

  const Cap = window.Capacitor;
  const isNative = !!(Cap && typeof Cap.isNativePlatform === "function" && Cap.isNativePlatform());
  const P = isNative ? (Cap.Plugins || {}) : {};
  const plugin = (name) => P[name] || null;

  const FASTING_NOTIF_ID  = 7001;
  const ACTIVITY_NOTIF_ID = 7002;
  const REMINDER_CHANNEL  = "reminders";
  const HORIZON_DAYS      = 7;
  const MAX_SCHEDULED     = 60;

  let permission = isNative ? "unknown" : "web";   // granted | denied | prompt | web
  let syncTimer = null;
  let lastLiveSig = { fasting: null, activity: null };
  let lastReminderSig = null;

  /* =========================================================
     Settings helpers
     ========================================================= */
  function settings() {
    try { return (Storage.loadState().settings) || {}; } catch (e) { return {}; }
  }
  const liveTimerOn = () => settings().liveTimer !== false;
  const hapticsOn   = () => settings().haptics !== false;

  /* =========================================================
     1. Live timer notification
     ========================================================= */
  function fmtClock(ts) {
    const s = settings();
    const h12 = s.hourFormat === "12h";
    return new Date(ts).toLocaleTimeString(undefined, {
      hour: "numeric", minute: "2-digit", hour12: h12
    });
  }

  function fastingPayload(state) {
    const a = state.fasting && state.fasting.active;
    if (!a) return null;
    const stages = Fasting.MILESTONES
      .filter(m => isFinite(m.from))
      .map(m => ({ at: a.startTs + m.from * 3600000, text: m.title, emoji: m.icon }));
    return {
      key: "fasting",
      notificationId: FASTING_NOTIF_ID,
      mode: "countdown",
      startTs: a.startTs,
      targetTs: a.targetTs,
      title: "Fasting · " + a.plan,
      format: "%s Remaining",
      completeFormat: "%s Fasted",
      sub: "Target " + fmtClock(a.targetTs) + " · " + a.plan,
      completeSub: "🎉 Target reached · tap to finish your fast",
      completeEmoji: "🏆",
      emoji: "⏳",
      color: "#4dd4ac",
      stages: stages
    };
  }

  function activityPayload(state) {
    const act = state.activeActivity;
    if (!act) return null;
    const a = (state.activities || []).find(x => x.id === act.activityId);
    if (!a) return null;
    const unit = a.targetUnit === "custom" ? (a.customUnit || "units") : a.targetUnit;
    return {
      key: "activity",
      notificationId: ACTIVITY_NOTIF_ID,
      mode: "countup",
      startTs: act.startTs - (act.accumulatedMs || 0),
      title: a.name,
      format: "%s Elapsed",
      text: a.name + " in progress",
      sub: "Goal " + a.targetValue + " " + unit + " / " + a.targetPeriod,
      emoji: a.icon || "⏱",
      color: "#6e8bff"
    };
  }

  function syncLive(state, force) {
    const LT = plugin("LiveTimer");
    if (!LT) return;
    const on = liveTimerOn() && permission === "granted";

    [["fasting", on ? fastingPayload(state) : null],
     ["activity", on ? activityPayload(state) : null]].forEach(([key, payload]) => {
      const sig = payload ? JSON.stringify(payload) : null;
      if (!force && sig === lastLiveSig[key]) return;
      lastLiveSig[key] = sig;
      const p = payload ? LT.start(payload) : LT.stop({ key: key });
      if (p && p.catch) p.catch(e => console.warn("[native] LiveTimer", key, e));
    });
  }

  /* =========================================================
     2. System reminders (LocalNotifications)
     ========================================================= */
  function hashId(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    return 100000 + (Math.abs(h) % 2000000000);   // stay clear of live timer ids
  }

  function atTime(day, hhmm) {
    const [hh, mm] = String(hhmm || "09:00").split(":").map(Number);
    return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hh || 0, mm || 0, 0, 0).getTime();
  }

  function buildReminderList(state) {
    const s = state.settings || {};
    if (s.remindersEnabled === false) return [];
    const prefs = s.reminderPrefs || {};
    const now = Date.now();
    const out = [];
    const add = (key, ts, n) => {
      if (ts <= now + 5000) return;
      out.push(Object.assign({ id: hashId(key + "@" + ts), at: ts, key: key }, n));
    };
    const days = [];
    for (let i = 0; i < HORIZON_DAYS; i++) {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + i); days.push(d);
    }

    /* Activity + to-do reminders */
    (state.reminders || []).forEach(r => {
      if (!r.enabled) return;
      if (r.type === "activity") {
        if (prefs.activity === false) return;
        const a = (state.activities || []).find(x => x.id === r.sourceId);
        if (!a || a.paused) return;
        const unit = a.targetUnit === "custom" ? (a.customUnit || "") : (a.targetUnit || "");
        days.forEach((d, i) => {
          if (Array.isArray(r.days) && r.days.length && r.days.indexOf(d.getDay()) === -1) return;
          if (i === 0 && typeof Activities !== "undefined") {
            try { if (Activities.getProgress(state, a).done) return; } catch (e) {}
          }
          add("act:" + r.id, atTime(d, r.time) - (r.advanceMinutes || 0) * 60000, {
            title: (a.icon || "🎯") + " " + a.name,
            body: "Time for your " + a.targetValue + " " + unit + " goal.",
            actionTypeId: "rh-activity",
            extra: { kind: "activity", reminderId: r.id, activityId: a.id }
          });
        });
      }
      if (r.type === "todo") {
        if (prefs.todo === false) return;
        const t = (state.todos || []).find(x => x.id === r.sourceId);
        if (!t || t.completed || !r.date) return;
        const [y, mo, dd] = r.date.split("-").map(Number);
        add("todo:" + r.id, atTime(new Date(y, mo - 1, dd), r.time) - (r.advanceMinutes || 0) * 60000, {
          title: "📝 " + t.title,
          body: "Scheduled task" + (t.time ? " at " + t.time : ""),
          actionTypeId: "rh-todo",
          extra: { kind: "todo", reminderId: r.id, todoId: t.id }
        });
      }
      if (r.snoozeUntil && r.snoozeUntil > now) {
        add("snooze:" + r.id, r.snoozeUntil, {
          title: "⏰ Snoozed reminder", body: "Your snoozed reminder is due.",
          extra: { kind: "snooze", reminderId: r.id }
        });
      }
    });

    /* Fasting */
    const fr = s.fastingReminders || {};
    const active = state.fasting && state.fasting.active;
    if (active) {
      if (fr.endingEnabled !== false && prefs.fastingEnding !== false) {
        const adv = (fr.endingAdvanceMinutes || 30) * 60000;
        add("fast-ending:" + active.startTs, active.targetTs - adv, {
          title: "🔥 Almost there",
          body: Math.round(adv / 60000) + " minutes left in your " + active.plan + " fast.",
          extra: { kind: "fasting-ending" }
        });
      }
      if (fr.completeEnabled !== false && prefs.fastingComplete !== false) {
        add("fast-complete:" + active.startTs, active.targetTs, {
          title: "🏆 Fast complete!",
          body: active.durationHours + "h target reached. Tap to finish your fast.",
          actionTypeId: "rh-fast-complete",
          extra: { kind: "fasting-complete" }
        });
      }
    }
    if (fr.startEnabled !== false && prefs.fastingStart !== false && fr.startTime) {
      days.forEach(d => {
        const ts = atTime(d, fr.startTime);
        if (active && ts < active.targetTs) return;
        add("fast-start", ts, {
          title: "⏳ Time to fast?",
          body: "Your fasting window starts at " + fr.startTime + ".",
          actionTypeId: "rh-fast-start",
          extra: { kind: "fasting-start" }
        });
      });
    }

    /* Weekly summary */
    const ws = s.weeklySummaryReminder || {};
    if (ws.enabled !== false && prefs.weeklySummary !== false && ws.time) {
      const want = ws.day == null ? 0 : ws.day;
      days.forEach(d => {
        if (d.getDay() !== want) return;
        add("weekly", atTime(d, ws.time), {
          title: "📊 Your week at a glance",
          body: "Tap to review your progress.",
          extra: { kind: "weekly" }
        });
      });
    }

    out.sort((a, b) => a.at - b.at);
    return out.slice(0, MAX_SCHEDULED);
  }

  async function syncReminders(state, force) {
    const LN = plugin("LocalNotifications");
    if (!LN || permission !== "granted") return;
    const list = buildReminderList(state);
    const sig = JSON.stringify(list.map(n => [n.id, n.at, n.title, n.body]));
    if (!force && sig === lastReminderSig) return;
    lastReminderSig = sig;
    try {
      const pending = await LN.getPending();
      const ours = ((pending && pending.notifications) || [])
        .filter(n => n.extra && n.extra.rh === true)
        .map(n => ({ id: n.id }));
      if (ours.length) await LN.cancel({ notifications: ours });
      if (!list.length) return;
      await LN.schedule({
        notifications: list.map(n => ({
          id: n.id,
          title: n.title,
          body: n.body,
          channelId: REMINDER_CHANNEL,
          smallIcon: "ic_stat_timer",
          iconColor: "#4dd4ac",
          actionTypeId: n.actionTypeId || undefined,
          schedule: { at: new Date(n.at), allowWhileIdle: true },
          extra: Object.assign({ rh: true }, n.extra)
        }))
      });
    } catch (e) {
      lastReminderSig = null;
      console.warn("[native] reminder sync failed", e);
    }
  }

  async function setupReminderChannelAndActions() {
    const LN = plugin("LocalNotifications");
    if (!LN) return;
    try {
      await LN.createChannel({
        id: REMINDER_CHANNEL, name: "Reminders",
        description: "Activity, fasting and task reminders",
        importance: 4, visibility: 1, vibration: true
      });
      await LN.registerActionTypes({
        types: [
          { id: "rh-activity", actions: [
            { id: "start",  title: "▶ Start" },
            { id: "snooze", title: "Snooze 10 min" } ] },
          { id: "rh-todo", actions: [
            { id: "done",   title: "✓ Done" },
            { id: "snooze", title: "Snooze 10 min" } ] },
          { id: "rh-fast-start", actions: [
            { id: "startFast", title: "Start Fast" } ] },
          { id: "rh-fast-complete", actions: [
            { id: "finishFast", title: "Finish Fast" } ] }
        ]
      });
      await LN.addListener("localNotificationActionPerformed", onNotificationAction);
    } catch (e) {
      console.warn("[native] channel/action setup failed", e);
    }
  }

  function onNotificationAction(ev) {
    const n = (ev && ev.notification) || {};
    const x = n.extra || {};
    const action = ev && ev.actionId;
    const s = Storage.loadState();
    const refresh = () => { if (window.App && App.refreshAll) App.refreshAll(); };

    if (action === "snooze" && x.reminderId) {
      Reminders.snooze(s, x.reminderId, 10);
      toast("Snoozed for 10 minutes");
      return;
    }
    if (action === "start" && x.activityId) {
      if (!s.activeActivity) Activities.startActivityTimer(s, x.activityId);
      refresh(); App.switchTab("today");
      return;
    }
    if (action === "done" && x.todoId) {
      const t = (s.todos || []).find(t => t.id === x.todoId);
      if (t && !t.completed) Todos.toggle(s, x.todoId);
      refresh(); toast("Task completed");
      return;
    }
    /* "Finish Fast" button ends the fast. A plain tap only opens the app,
       so the user can review before finishing. */
    if (action === "finishFast") {
      App.switchTab("today");
      if (s.fasting && s.fasting.active) {
        Fasting.endFasting(s, true);
        refresh();
        toast("Fast finished 🎉");
      }
      return;
    }
    if (action === "startFast" || x.kind === "fasting-start") {
      App.switchTab("today");
      if (!(s.fasting && s.fasting.active) && typeof FastingUI !== "undefined") {
        setTimeout(() => FastingUI.openPlanPicker(Storage.loadState(), false), 350);
      }
      return;
    }
    if (x.kind === "weekly") { App.switchTab("progress"); return; }
    App.switchTab("today");
  }

  /* =========================================================
     Permissions
     ========================================================= */
  async function refreshPermission(ask) {
    const LN = plugin("LocalNotifications");
    if (!LN) { permission = isNative ? "denied" : "web"; return permission; }
    try {
      let st = await LN.checkPermissions();
      if (ask && st.display !== "granted" && st.display !== "denied") {
        st = await LN.requestPermissions();
      }
      permission = st.display === "granted" ? "granted" : (st.display || "denied");
    } catch (e) {
      permission = "denied";
    }
    return permission;
  }

  /* =========================================================
     Central sync (debounced)
     ========================================================= */
  function scheduleSync(force) {
    if (!isNative) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => syncNow(force), force ? 50 : 700);
  }
  function syncNow(force) {
    if (!isNative) return;
    let state;
    try { state = Storage.loadState(); } catch (e) { return; }
    syncLive(state, force);
    syncReminders(state, force);
  }

  /* When system reminders are active, skip the in-app popup for the
     same reminder so the user is not notified twice. */
  function wrapInAppNotifications() {
    if (!window.NotificationAdapter) return;
    const orig = NotificationAdapter.deliver;
    NotificationAdapter.deliver = function (payload) {
      if (isNative && permission === "granted") return;
      return orig.apply(this, arguments);
    };
  }

  /* =========================================================
     3. Back button
     ========================================================= */
  function closeTopOverlay() {
    const notif = document.getElementById("notification-host");
    if (notif && notif.children.length) {
      if (window.NotificationAdapter) NotificationAdapter.close(); else notif.innerHTML = "";
      return true;
    }
    for (const id of ["achievement-host", "fasting-setup-host", "sheet-host"]) {
      const h = document.getElementById(id);
      if (h && h.children.length) { h.innerHTML = ""; return true; }
    }
    const modal = document.querySelector(".modal-root.open");
    if (modal) {
      if (typeof ActivityModal !== "undefined" && typeof ActivityModal.close === "function") ActivityModal.close();
      else {
        modal.classList.remove("open");
        document.body.style.overflow = "";
      }
      return true;
    }
    return false;
  }

  function onBack() {
    if (closeTopOverlay()) return;
    const activePanel = document.querySelector(".tab-panel.active");
    if (activePanel && activePanel.id !== "tab-today" && window.App) {
      App.switchTab("today");
      return;
    }
    const AppP = plugin("App");
    if (AppP && AppP.minimizeApp) AppP.minimizeApp();
    else if (AppP && AppP.exitApp) AppP.exitApp();
  }

  /* =========================================================
     4. Haptics
     ========================================================= */
  function haptic(kind) {
    if (!isNative || !hapticsOn()) return;
    const H = plugin("Haptics");
    if (!H) return;
    try {
      let p;
      if (kind === "success") p = H.notification({ type: "SUCCESS" });
      else if (kind === "warning") p = H.notification({ type: "WARNING" });
      else if (kind === "medium") p = H.impact({ style: "MEDIUM" });
      else p = H.impact({ style: "LIGHT" });
      if (p && p.catch) p.catch(() => {});
    } catch (e) {}
  }
  const TAP_SELECTOR = ".btn, .nav-btn, .fab-add, .todo-check, .period-btn, .plan-btn, " +
    ".theme-option, .font-option, .hour-option, .cal-cell, .cal-week-chip, .icon-pick, " +
    ".day-pick, .option-item, .switch, .fc-end-btn, .fc-options-btn, [data-action]";
  let lastHapticAt = 0;
  function wireHaptics() {
    document.addEventListener("click", (e) => {
      const el = e.target.closest && e.target.closest(TAP_SELECTOR);
      if (!el || el.disabled) return;
      /* A <label class="switch"> click also fires a click on its <input>;
         throttle so one tap = one vibration. */
      const t = Date.now();
      if (t - lastHapticAt < 120) return;
      lastHapticAt = t;
      const danger = el.classList.contains("btn-danger") || el.classList.contains("danger");
      haptic(danger ? "warning" : "light");
    }, { capture: true, passive: true });
  }

  /* =========================================================
     5. Status bar follows theme
     ========================================================= */
  function syncSystemBars() {
    const light = document.body.classList.contains("light");
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", light ? "#f4f6fa" : "#0a0c11");
    const SB = plugin("SystemBars") || null;
    if (SB && SB.setStyle) {
      SB.setStyle({ style: light ? "LIGHT" : "DARK" }).catch(() => {});
    }
  }

  /* =========================================================
     6. Backup export via share sheet
     ========================================================= */
  async function nativeExport() {
    const FS = plugin("Filesystem");
    const Share = plugin("Share");
    if (!FS || !Share) { alert("Export is not available on this device."); return; }
    try {
      const json = Storage.exportBackup();
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
      const path = "rutin-harian-backup-" + stamp + ".json";
      const res = await FS.writeFile({ path: path, data: json, directory: "CACHE", encoding: "utf8" });
      await Share.share({
        title: "Rutin Harian backup",
        text: "Rutin Harian backup " + stamp,
        files: [res.uri],
        dialogTitle: "Save or send your backup"
      });
    } catch (e) {
      if (String(e && e.message || e).toLowerCase().indexOf("cancel") === -1) {
        alert("Export failed.\n" + (e && e.message ? e.message : e));
      }
    }
  }

  /* =========================================================
     Small helpers
     ========================================================= */
  function toast(msg) {
    if (typeof Backup !== "undefined" && Backup.toast) Backup.toast(msg);
  }

  function statusText() {
    if (!isNative) return "Available in the Android app";
    if (permission === "granted") return "Notifications allowed";
    if (permission === "denied") return "Notifications blocked in Android settings";
    return "Permission not granted yet";
  }

  async function testNotification() {
    if (!isNative) { alert("Test notifications work in the Android app."); return; }
    await refreshPermission(true);
    const LN = plugin("LocalNotifications");
    if (permission !== "granted" || !LN) {
      alert("Please allow notifications for Rutin Harian in Android Settings → Apps → Rutin Harian → Notifications.");
      return;
    }
    await LN.schedule({ notifications: [{
      id: 99001, title: "🔔 Test reminder", body: "Reminders are working.",
      channelId: REMINDER_CHANNEL, smallIcon: "ic_stat_timer", iconColor: "#4dd4ac",
      schedule: { at: new Date(Date.now() + 5000), allowWhileIdle: true },
      extra: { kind: "test" }
    }]});
    toast("Test notification in 5 seconds");
  }

  /* =========================================================
     Boot
     ========================================================= */
  function installStorageHook() {
    if (!window.Storage || Storage.__nativeWrapped) return;
    const origSave = Storage.saveState;
    Storage.saveState = function () {
      const r = origSave.apply(this, arguments);
      scheduleSync(false);
      return r;
    };
    Storage.__nativeWrapped = true;
  }

  async function boot() {
    document.documentElement.classList.toggle("is-native", isNative);
    if (!isNative) return;

    installStorageHook();
    wrapInAppNotifications();
    wireHaptics();
    if (typeof Backup !== "undefined") Backup.exportNow = nativeExport;

    /* Theme → status bar */
    syncSystemBars();
    new MutationObserver(syncSystemBars)
      .observe(document.body, { attributes: true, attributeFilter: ["class"] });

    const AppP = plugin("App");
    if (AppP) {
      AppP.addListener("backButton", onBack);
      AppP.addListener("resume", () => {
        if (window.App && App.refreshAll) App.refreshAll();
        refreshPermission(false).then(() => syncNow(true));
      });
    }

    await setupReminderChannelAndActions();
    await refreshPermission(true);
    syncNow(true);
    if (typeof Profile !== "undefined" && document.getElementById("tab-profile").classList.contains("active")) {
      Profile.refresh();
    }
  }

  /* Run after app.js has booted. */
  if (document.readyState === "complete") setTimeout(boot, 300);
  else window.addEventListener("load", () => setTimeout(boot, 300));

  /* Install the save hook immediately so early saves are caught too. */
  if (isNative) installStorageHook();

  return {
    isNative: isNative,
    haptic: haptic,
    sync: () => scheduleSync(true),
    statusText: statusText,
    testNotification: testNotification,
    requestPermission: async () => { await refreshPermission(true); syncNow(true); return permission; },
    get permission() { return permission; }
  };
})();

window.Native = Native;
