/* =========================================================
   reminders.js — Reminder scheduler (window 10 minit)
   ========================================================= */

const Reminders = (() => {

  let tickHandle = null;
  let started = false;

  const CHECK_INTERVAL_MS = 10 * 1000;         /* check setiap 10s */
  const TRIGGER_WINDOW_MS = 10 * 60 * 1000;    /* lebar window 10 minit */
  const FIRED_KEY = "routineFast.v1.fired";
  const DEBUG = true;

  function log(...a) { if (DEBUG) console.debug("[reminders]", ...a); }

  function create(state, data) {
    const r = {
      id: data.id || ("rm-" + Storage.uid()),
      type: data.type || "activity",
      sourceId: data.sourceId || null,
      enabled: data.enabled !== false,
      date: data.date || null,
      time: data.time || "09:00",
      days: Array.isArray(data.days) ? data.days : [],
      advanceMinutes: data.advanceMinutes || 0,
      lastFiredKey: null,
      snoozeUntil: null
    };
    state.reminders = state.reminders || [];
    state.reminders.push(r);
    Storage.saveState(state);
    return r;
  }

  function update(state, id, patch) {
    const idx = (state.reminders || []).findIndex(r => r.id === id);
    if (idx < 0) return null;
    state.reminders[idx] = Object.assign({}, state.reminders[idx], patch);
    Storage.saveState(state);
    return state.reminders[idx];
  }

  function remove(state, id) {
    state.reminders = (state.reminders || []).filter(r => r.id !== id);
    Storage.saveState(state);
  }

  function getById(state, id) {
    return (state.reminders || []).find(r => r.id === id) || null;
  }

  function upsertForActivity(state, activityId, patch) {
    const existing = (state.reminders || []).find(r =>
      r.type === "activity" && r.sourceId === activityId);
    if (existing) {
      const merged = Object.assign({}, existing, patch);
      if (patch.time && patch.time !== existing.time) merged.lastFiredKey = null;
      if (patch.enabled === true && existing.enabled === false) merged.lastFiredKey = null;
      return update(state, existing.id, merged);
    }
    const created = Object.assign({ type: "activity", sourceId: activityId }, patch);
    return create(state, created);
  }

  function upsertForTodo(state, todoId, patch) {
    const existing = (state.reminders || []).find(r =>
      r.type === "todo" && r.sourceId === todoId);
    if (existing) {
      const merged = Object.assign({}, existing, patch);
      if (patch.time && patch.time !== existing.time) merged.lastFiredKey = null;
      if (patch.enabled === true && existing.enabled === false) merged.lastFiredKey = null;
      return update(state, existing.id, merged);
    }
    const created = Object.assign({ type: "todo", sourceId: todoId }, patch);
    return create(state, created);
  }

  function removeForSource(state, sourceId) {
    state.reminders = (state.reminders || []).filter(r => r.sourceId !== sourceId);
    Storage.saveState(state);
  }

  function startScheduler() {
    if (started) return;
    started = true;
    tickHandle = setInterval(checkDue, CHECK_INTERVAL_MS);
    log("scheduler started, interval=" + CHECK_INTERVAL_MS + "ms, window=" + TRIGGER_WINDOW_MS + "ms");
    setTimeout(checkDue, 300);
  }

  function stopScheduler() {
    if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
    started = false;
  }

  function checkDue() {
    let state;
    try { state = Storage.loadState(); }
    catch (e) { console.error("[reminders] load failed:", e); return; }

    const settings = state.settings || {};
    const prefs = settings.reminderPrefs || {};
    if (settings.remindersEnabled === false) { log("master OFF"); return; }

    const now = Date.now();
    const hhmm = new Date(now).toTimeString().slice(0, 5);
    log("tick @" + hhmm + " — reminders=" + (state.reminders || []).length);

    try { checkIndividual(state, prefs, now); }
    catch (e) { console.error("[reminders] individual:", e); }

    try { checkFasting(state, prefs, settings, now); }
    catch (e) { console.error("[reminders] fasting:", e); }

    try { checkWeekly(state, prefs, settings, now); }
    catch (e) { console.error("[reminders] weekly:", e); }
  }

  function isTypeEnabled(type, prefs) {
    if (type === "activity")         return prefs.activity !== false;
    if (type === "todo")             return prefs.todo !== false;
    if (type === "fasting-start")    return prefs.fastingStart !== false;
    if (type === "fasting-ending")   return prefs.fastingEnding !== false;
    if (type === "fasting-complete") return prefs.fastingComplete !== false;
    if (type === "weekly-summary")   return prefs.weeklySummary !== false;
    return true;
  }

  function checkIndividual(state, prefs, now) {
    (state.reminders || []).forEach(r => {
      const tag = "rm[" + (r.id || "").slice(-6) + "] type=" + r.type;

      if (!r.enabled) { log(tag, "disabled"); return; }
      if (!isTypeEnabled(r.type, prefs)) { log(tag, "type disabled"); return; }
      if (r.snoozeUntil && r.snoozeUntil > now) {
        log(tag, "snoozed until", new Date(r.snoozeUntil).toLocaleTimeString());
        return;
      }

      const targetTs = computeTargetTs(r, now);
      if (targetTs == null) { log(tag, "not scheduled today"); return; }

      const delta = now - targetTs;
      if (delta < 0) { log(tag, "waiting — due in", Math.round(-delta / 1000), "s"); return; }
      if (delta > TRIGGER_WINDOW_MS) { log(tag, "MISSED window (delta " + Math.round(delta / 1000) + "s)"); return; }

      const fireKey = makeFireKey(targetTs);
      if (r.lastFiredKey === fireKey) { log(tag, "already fired"); return; }

      log(tag, "★ FIRING now (delta " + Math.round(delta / 1000) + "s)");
      markIndividualFired(r.id, fireKey);

      const payload = buildPayload(state, r);
      if (!payload) { log(tag, "! payload null"); return; }
      if (window.NotificationAdapter) NotificationAdapter.deliver(payload);
    });
  }

  function computeTargetTs(r, now) {
    if (!r.time) return null;
    const advanceMs = (r.advanceMinutes || 0) * 60000;
    const today = new Date(now);
    const parts = r.time.split(":");
    const hh = Number(parts[0]);
    const mm = Number(parts[1]);

    if (r.date) {
      const [y, mo, d] = r.date.split("-").map(Number);
      return new Date(y, mo - 1, d, hh, mm, 0, 0).getTime() - advanceMs;
    }

    if (Array.isArray(r.days) && r.days.length) {
      if (r.days.indexOf(today.getDay()) === -1) return null;
    }

    return new Date(today.getFullYear(), today.getMonth(), today.getDate(), hh, mm, 0, 0).getTime() - advanceMs;
  }

  function makeFireKey(targetTs) {
    const d = new Date(targetTs);
    return Storage.todayKey(d) + " " +
      String(d.getHours()).padStart(2, "0") + ":" +
      String(d.getMinutes()).padStart(2, "0");
  }

  function markIndividualFired(id, fireKey) {
    const s = Storage.loadState();
    const idx = (s.reminders || []).findIndex(r => r.id === id);
    if (idx < 0) return;
    s.reminders[idx].lastFiredKey = fireKey;
    s.reminders[idx].snoozeUntil = null;
    Storage.saveState(s);
  }

  function buildPayload(state, r) {
    if (r.type === "activity") {
      const a = (state.activities || []).find(x => x.id === r.sourceId);
      if (!a) { log("payload: activity not found"); return null; }
      if (a.paused) { log("payload: activity paused"); return null; }
      return {
        id: r.id,
        kind: "activity",
        icon: a.icon || "🎯",
        eyebrow: "ACTIVITY REMINDER",
        title: a.name,
        text: (a.targetValue || "") + " " + (a.targetUnit || "") + " goal scheduled now.",
        actions: [
          { label: "Snooze", kind: "ghost", onClick: () => snooze(Storage.loadState(), r.id, 10) },
          { label: "Start", kind: "primary", onClick: () => {
              const s = Storage.loadState();
              Activities.startActivityTimer(s, a.id);
              if (window.App && App.refreshAll) App.refreshAll();
            }}
        ]
      };
    }
    if (r.type === "todo") {
      const t = (state.todos || []).find(x => x.id === r.sourceId);
      if (!t) { log("payload: todo not found"); return null; }
      if (t.completed) { log("payload: todo completed"); return null; }
      return {
        id: r.id,
        kind: "todo",
        icon: "📝",
        eyebrow: "TO-DO REMINDER",
        title: t.title,
        text: t.time ? ("Scheduled for " + formatTime12(t.time)) : "Scheduled task",
        actions: [
          { label: "Snooze", kind: "ghost", onClick: () => snooze(Storage.loadState(), r.id, 10) },
          { label: "Complete", kind: "primary", onClick: () => {
              const s = Storage.loadState();
              Todos.toggle(s, t.id);
              if (window.App && App.refreshAll) App.refreshAll();
            }}
        ]
      };
    }
    return null;
  }

  function checkFasting(state, prefs, settings, now) {
    const fr = settings.fastingReminders || {};
    const d = new Date(now);
    const todayKey = Storage.todayKey(d);

    if (fr.startEnabled !== false && prefs.fastingStart !== false &&
        !state.fasting.active && fr.startTime) {
      const parts = fr.startTime.split(":");
      const hh = Number(parts[0]);
      const mm = Number(parts[1]);
      const t = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm, 0, 0).getTime();
      const delta = now - t;
      const fireKey = "fasting-start:" + todayKey + " " + fr.startTime;
      if (delta >= 0 && delta <= TRIGGER_WINDOW_MS && !isFired(fireKey)) {
        log("★ FIRING fasting-start");
        markFired(fireKey);
        if (window.NotificationAdapter) {
          NotificationAdapter.deliver({
            id: fireKey, kind: "fasting-start", icon: "⏳",
            eyebrow: "FASTING REMINDER", title: "Time to fast?",
            text: "Your fasting window is scheduled at " + formatTime12(fr.startTime) + ".",
            actions: [
              { label: "Later", kind: "ghost" },
              { label: "Start Now", kind: "primary", onClick: () => {
                  if (window.FastingUI) FastingUI.openPlanPicker(Storage.loadState(), false);
                }}
            ]
          });
        }
      }
    }

    if (fr.endingEnabled !== false && prefs.fastingEnding !== false && state.fasting.active) {
      const a = state.fasting.active;
      const remainMs = a.targetTs - now;
      const advanceMs = (fr.endingAdvanceMinutes || 30) * 60000;
      if (remainMs > 0 && remainMs <= advanceMs) {
        const key = "fasting-ending:" + a.startTs;
        if (!isFired(key)) {
          log("★ FIRING fasting-ending");
          markFired(key);
          if (window.NotificationAdapter) {
            NotificationAdapter.deliver({
              id: key, kind: "fasting-ending", icon: "🔥",
              eyebrow: "ALMOST THERE",
              title: Math.round(remainMs / 60000) + " minutes remaining",
              text: "Your fast is almost complete. Plan: " + a.plan + ".",
              actions: [{ label: "OK", kind: "primary" }]
            });
          }
        }
      }
    }

    if (fr.completeEnabled !== false && prefs.fastingComplete !== false && state.fasting.active) {
      const a = state.fasting.active;
      if (now >= a.targetTs) {
        const key = "fasting-complete:" + a.startTs;
        if (!isFired(key)) {
          log("★ FIRING fasting-complete");
          markFired(key);
          if (window.NotificationAdapter) {
            NotificationAdapter.deliver({
              id: key, kind: "fasting-complete", icon: "🏆",
              eyebrow: "FAST COMPLETE",
              title: a.durationHours + "h target reached",
              text: "You can now finish your fast when ready.",
              actions: [
                { label: "Later", kind: "ghost" },
                { label: "Finish Fast", kind: "primary", onClick: () => {
                    Fasting.endFasting(Storage.loadState(), true);
                    if (window.App && App.refreshAll) App.refreshAll();
                  }}
              ]
            });
          }
        }
      }
    }
  }

  function checkWeekly(state, prefs, settings, now) {
    const ws = settings.weeklySummaryReminder || {};
    if (ws.enabled === false) return;
    if (prefs.weeklySummary === false) return;
    if (!ws.time) return;

    const d = new Date(now);
    const want = (ws.day == null ? 0 : ws.day);
    if (d.getDay() !== want) return;

    const parts = ws.time.split(":");
    const hh = Number(parts[0]);
    const mm = Number(parts[1]);
    const t = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm, 0, 0).getTime();
    const delta = now - t;
    const fireKey = "weekly-summary:" + Storage.todayKey(d) + " " + ws.time;

    if (delta >= 0 && delta <= TRIGGER_WINDOW_MS && !isFired(fireKey)) {
      log("★ FIRING weekly-summary");
      markFired(fireKey);
      if (window.NotificationAdapter) {
        NotificationAdapter.deliver({
          id: fireKey, kind: "weekly-summary", icon: "📊",
          eyebrow: "WEEKLY SUMMARY", title: "Your week at a glance",
          text: "Tap to view your progress.",
          actions: [
            { label: "Later", kind: "ghost" },
            { label: "View", kind: "primary", onClick: () => {
                if (window.App && App.switchTab) App.switchTab("progress");
              }}
          ]
        });
      }
    }
  }

  function snooze(state, reminderId, minutes) {
    minutes = minutes || 10;
    const s = Storage.loadState();
    const idx = (s.reminders || []).findIndex(r => r.id === reminderId);
    if (idx < 0) {
      const cache = loadFiredCache();
      cache[reminderId] = Date.now() + minutes * 60000;
      saveFiredCache(cache);
      return;
    }
    s.reminders[idx].snoozeUntil = Date.now() + minutes * 60000;
    s.reminders[idx].lastFiredKey = null;
    Storage.saveState(s);
  }

  function loadFiredCache() {
    try { return JSON.parse(localStorage.getItem(FIRED_KEY) || "{}"); }
    catch (e) { return {}; }
  }
  function saveFiredCache(c) {
    try { localStorage.setItem(FIRED_KEY, JSON.stringify(c)); } catch (e) {}
  }
  function isFired(key) {
    const cache = loadFiredCache();
    return !!cache[key];
  }
  function markFired(key) {
    const cache = loadFiredCache();
    cache[key] = Date.now();
    const cutoff = Date.now() - 7 * 86400000;
    Object.keys(cache).forEach(k => { if (cache[k] < cutoff) delete cache[k]; });
    saveFiredCache(cache);
  }

  function formatTime12(hhmm) {
    if (!hhmm) return "";
    const parts = hhmm.split(":");
    const h = Number(parts[0]);
    const m = Number(parts[1]);
    return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, {
      hour: "numeric", minute: "2-digit"
    });
  }

  return {
    create: create,
    update: update,
    remove: remove,
    getById: getById,
    upsertForActivity: upsertForActivity,
    upsertForTodo: upsertForTodo,
    removeForSource: removeForSource,
    startScheduler: startScheduler,
    stopScheduler: stopScheduler,
    snooze: snooze,
    formatTime12: formatTime12
  };
})();

window.Reminders = Reminders;  /* expose for window.Reminders checks in other modules */
