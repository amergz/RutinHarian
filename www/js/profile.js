/* =========================================================
   profile.js — Profile + Settings
   Groups: Profile, Appearance (theme + font + hour), Reminders,
   Fasting Reminders, Activity Reminders, Data & Backup, About
   ========================================================= */

const Profile = (() => {

  let els = {};
  const openGroups = new Set(["profile"]);

  function init(rootEls) { els = rootEls; render(); }
  function refresh() { render(); }
  function isOpen(id) { return openGroups.has(id); }
  function toggle(id) {
    if (openGroups.has(id)) openGroups.delete(id);
    else                    openGroups.add(id);
    render();
  }

  function render() {
    const state = Storage.loadState();
    const settings = state.settings || {};

    els.body.innerHTML = [
      renderProfileHero(state),
      renderProfileGroup(state),
      renderAppearanceGroup(settings),
      renderReminderGroup(settings),
      renderNativeGroup(settings),
      renderFastingRemindersGroup(settings),
      renderActivityRemindersGroup(state),
      renderDataGroup(),
      renderAboutGroup()
    ].join("");

    wireEvents(state);
  }

  /* =========================================================
     Hero
     ========================================================= */
  function renderProfileHero(state) {
    const name = (state.user && state.user.name ? state.user.name : "Friend").trim();
    const initial = name.charAt(0).toUpperCase() || "F";
    const xp = XP.levelInfo((state.xp && state.xp.total) || 0);
    const streak = (state.streak && state.streak.current) || 0;

    return [
      '<div class="profile-hero">',
      '  <div class="profile-avatar">' + escapeHtml(initial) + '</div>',
      '  <div class="profile-info">',
      '    <div class="profile-name" data-edit-name>',
      '      ' + escapeHtml(name),
      '      <span class="profile-name-edit">✏️</span>',
      '    </div>',
      '    <div class="profile-sub">Level ' + xp.level + ' · ' + xp.totalXp + ' XP</div>',
      '    <div class="profile-badges-row">',
      '      <span class="profile-chip gold">⭐ ' + xp.totalXp + ' XP</span>',
      '      <span class="profile-chip warn">🔥 ' + streak + ' day streak</span>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join("");
  }

  /* =========================================================
     Group wrapper
     ========================================================= */
  function group(opts) {
    const open = isOpen(opts.id);
    return [
      '<div class="setting-group ' + (open ? "open" : "") + '">',
      '  <button class="setting-group-header" data-group="' + opts.id + '">',
      '    <div class="setting-group-icon">' + opts.icon + '</div>',
      '    <div class="setting-group-titles">',
      '      <div class="setting-group-title">' + opts.title + '</div>',
      '      <div class="setting-group-summary">' + (opts.summary || "") + '</div>',
      '    </div>',
      '    <div class="setting-group-chevron">▼</div>',
      '  </button>',
      '  <div class="setting-group-body">',
      '    <div class="setting-group-inner">',
      opts.body,
      '    </div>',
      '  </div>',
      '</div>'
    ].join("");
  }

  /* =========================================================
     Profile
     ========================================================= */
  function renderProfileGroup(state) {
    const name = (state.user && state.user.name ? state.user.name : "Friend").trim();
    const xp = XP.levelInfo((state.xp && state.xp.total) || 0);

    return group({
      id: "profile",
      icon: "👤",
      title: "Profile",
      summary: name + " · Level " + xp.level,
      body: [
        '<div class="setting-row">',
        '  <div class="setting-row-label">',
        '    <span>Display Name</span>',
        '    <span>Shown on the Profile screen</span>',
        '  </div>',
        '  <button class="btn btn-ghost" style="flex:0 0 auto;min-width:80px" data-edit-name>Edit</button>',
        '</div>'
      ].join("")
    });
  }

  /* =========================================================
     Appearance (theme + font + hour)
     ========================================================= */
  function renderAppearanceGroup(settings) {
    const theme = settings.theme || "dark";
    const themeLabel = theme === "system" ? "System" : theme === "light" ? "Light" : "Dark";

    const fontSize = settings.fontSize || "medium";
    const fontLabel = fontSize.charAt(0).toUpperCase() + fontSize.slice(1);

    const hourFormat = settings.hourFormat || "24h";
    const hourLabel = hourFormat === "12h" ? "12-Hour" : "24-Hour";

    return group({
      id: "appearance",
      icon: "🎨",
      title: "Appearance",
      summary: themeLabel + " · " + fontLabel + " · " + hourLabel,
      body: [
        '<div class="setup-section-label">Theme</div>',
        '<div class="theme-picker">',
        '  <button class="theme-option ' + (theme === "dark" ? "active" : "") + '" data-theme="dark">',
        '    <div class="theme-swatch dark"></div>',
        '    <div class="theme-option-name">Dark</div>',
        '  </button>',
        '  <button class="theme-option ' + (theme === "light" ? "active" : "") + '" data-theme="light">',
        '    <div class="theme-swatch light"></div>',
        '    <div class="theme-option-name">Light</div>',
        '  </button>',
        '  <button class="theme-option ' + (theme === "system" ? "active" : "") + '" data-theme="system">',
        '    <div class="theme-swatch system"></div>',
        '    <div class="theme-option-name">System</div>',
        '  </button>',
        '</div>',

        '<div class="setup-section-label" style="margin-top:14px">Font Size</div>',
        '<div class="font-picker">',
        '  <button class="font-option ' + (fontSize === "small" ? "active" : "") + '" data-font="small">',
        '    <span class="font-preview font-preview-small">Aa</span>',
        '    <span class="font-option-name">Small</span>',
        '  </button>',
        '  <button class="font-option ' + (fontSize === "medium" ? "active" : "") + '" data-font="medium">',
        '    <span class="font-preview font-preview-medium">Aa</span>',
        '    <span class="font-option-name">Medium</span>',
        '  </button>',
        '  <button class="font-option ' + (fontSize === "large" ? "active" : "") + '" data-font="large">',
        '    <span class="font-preview font-preview-large">Aa</span>',
        '    <span class="font-option-name">Large</span>',
        '  </button>',
        '  <button class="font-option ' + (fontSize === "xlarge" ? "active" : "") + '" data-font="xlarge">',
        '    <span class="font-preview font-preview-xlarge">Aa</span>',
        '    <span class="font-option-name">XL</span>',
        '  </button>',
        '</div>',

        '<div class="setup-section-label" style="margin-top:14px">Time Format</div>',
        '<div class="hour-picker">',
        '  <button class="hour-option ' + (hourFormat === "24h" ? "active" : "") + '" data-hour="24h">',
        '    <span class="hour-preview">13:45</span>',
        '    <span class="hour-option-name">24-Hour</span>',
        '  </button>',
        '  <button class="hour-option ' + (hourFormat === "12h" ? "active" : "") + '" data-hour="12h">',
        '    <span class="hour-preview">1:45 PM</span>',
        '    <span class="hour-option-name">12-Hour</span>',
        '  </button>',
        '</div>'
      ].join("")
    });
  }

  /* =========================================================
     Reminders
     ========================================================= */
  function renderReminderGroup(settings) {
    const prefs = settings.reminderPrefs || {};
    const master = settings.remindersEnabled !== false;

    const active = [
      prefs.activity !== false,
      prefs.fastingStart !== false || prefs.fastingEnding !== false || prefs.fastingComplete !== false,
      prefs.todo !== false,
      prefs.weeklySummary !== false
    ].filter(Boolean).length;

    const summary = master ? (active + " active · Master ON") : "All reminders OFF";

    return group({
      id: "reminders",
      icon: "🔔",
      title: "Notifications & Reminders",
      summary: summary,
      body: [
        '<div class="setting-row">',
        '  <div class="setting-row-label"><span>Master Reminders</span><span>Turn all reminders on/off</span></div>',
        switchEl("master", master),
        '</div>',
        '<div class="setting-row">',
        '  <div class="setting-row-label"><span>Activity Reminders</span><span>Reminders linked to activities</span></div>',
        switchEl("activity", prefs.activity !== false),
        '</div>',
        '<div class="setting-row">',
        '  <div class="setting-row-label"><span>Fasting Reminders</span><span>Start, ending soon and complete</span></div>',
        switchEl("fasting", prefs.fastingStart !== false || prefs.fastingEnding !== false || prefs.fastingComplete !== false),
        '</div>',
        '<div class="setting-row">',
        '  <div class="setting-row-label"><span>To-Do Reminders</span><span>Tasks with a scheduled time</span></div>',
        switchEl("todo", prefs.todo !== false),
        '</div>',
        '<div class="setting-row">',
        '  <div class="setting-row-label"><span>Weekly Summary</span><span>Reminder to review your week</span></div>',
        switchEl("weekly", prefs.weeklySummary !== false),
        '</div>'
      ].join("")
    });
  }

  /* =========================================================
     Android app (live timer, haptics, permission)
     ========================================================= */
  function renderNativeGroup(settings) {
    const hasNative = typeof Native !== "undefined";
    const isNative = hasNative && Native.isNative;
    const status = hasNative ? Native.statusText() : "Available in the Android app";
    const granted = isNative && Native.permission === "granted";
    const live = settings.liveTimer !== false;
    const haptics = settings.haptics !== false;

    const summary = !isNative ? "Android app only"
      : (granted ? "Live timer " + (live ? "ON" : "OFF") + " · Notifications allowed"
                 : "Notifications not allowed");

    return group({
      id: "android",
      icon: "📱",
      title: "Android App",
      summary: summary,
      body: [
        '<div class="native-status ' + (granted ? "ok" : "warn") + '">',
        '  <span class="native-status-dot"></span>',
        '  <span>' + escapeHtml(status) + '</span>',
        '</div>',
        '<div class="setting-row">',
        '  <div class="setting-row-label"><span>Live Timer Notification</span>',
        '    <span>Shows fasting countdown &amp; activity timer in the notification bar</span></div>',
        switchEl("liveTimer", live),
        '</div>',
        '<div class="setting-row">',
        '  <div class="setting-row-label"><span>Haptic Feedback</span><span>Light vibration when tapping buttons</span></div>',
        switchEl("haptics", haptics),
        '</div>',
        '<div class="data-actions">',
        (isNative && !granted
          ? '  <button class="btn btn-primary full" data-native="perm">🔔 Allow Notifications</button>'
          : ''),
        '  <button class="btn btn-ghost full" data-native="test">🧪 Send Test Notification</button>',
        '</div>',
        '<p class="setting-note">Reminders are scheduled as Android system notifications, so they ',
        'still arrive when the app is closed. If they arrive late, set Battery for Rutin Harian ',
        'to <strong>Unrestricted</strong> in Android settings.</p>'
      ].join("")
    });
  }

  /* =========================================================
     Fasting Reminders
     ========================================================= */
  function renderFastingRemindersGroup(settings) {
    const fr = settings.fastingReminders || {};
    const ws = settings.weeklySummaryReminder || {};

    const en = [];
    if (fr.startEnabled !== false) en.push("Start");
    if (fr.endingEnabled !== false) en.push("Ending");
    if (fr.completeEnabled !== false) en.push("Complete");
    const summary = en.length ? en.join(" · ") : "All fasting reminders OFF";

    return group({
      id: "fasting-reminders",
      icon: "⏳",
      title: "Fasting Reminders",
      summary: summary,
      body: [
        '<div class="setting-row">',
        '  <div class="setting-row-label"><span>Fast Start Reminder</span><span>Suggested time to begin</span></div>',
        switchEl("fastStart", fr.startEnabled !== false),
        '</div>',
        '<div class="setting-row">',
        '  <div class="setting-row-label"><span>Start Time</span><span>Used when no fast is active</span></div>',
        '  <input type="time" value="' + (fr.startTime || "20:00") + '" data-field="fastingStartTime" class="setting-input">',
        '</div>',
        '<div class="setting-row">',
        '  <div class="setting-row-label"><span>Ending Soon</span><span>Notify before target</span></div>',
        switchEl("fastEnding", fr.endingEnabled !== false),
        '</div>',
        '<div class="setting-row">',
        '  <div class="setting-row-label"><span>Notify Before</span><span>Minutes before</span></div>',
        '  <select data-field="fastingEndingAdvance" class="setting-input">',
        [15, 30, 60, 120].map(function (m) {
          return '<option value="' + m + '"' + ((fr.endingAdvanceMinutes || 30) === m ? " selected" : "") + '>' + m + ' min</option>';
        }).join(""),
        '  </select>',
        '</div>',
        '<div class="setting-row">',
        '  <div class="setting-row-label"><span>Fast Complete</span><span>Notify when reached</span></div>',
        switchEl("fastComplete", fr.completeEnabled !== false),
        '</div>',

        '<div class="setup-section-label" style="margin-top:14px">Weekly Summary Reminder</div>',
        '<div class="setting-row">',
        '  <div class="setting-row-label"><span>Enable</span><span>Weekly review reminder</span></div>',
        switchEl("weeklyEnabled", ws.enabled !== false),
        '</div>',
        '<div class="setting-row">',
        '  <div class="setting-row-label"><span>Day</span><span>Day of week</span></div>',
        '  <select data-field="weeklyDay" class="setting-input">',
        ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map(function (d, i) {
          return '<option value="' + i + '"' + (((ws.day == null ? 0 : ws.day) === i) ? " selected" : "") + '>' + d + '</option>';
        }).join(""),
        '  </select>',
        '</div>',
        '<div class="setting-row">',
        '  <div class="setting-row-label"><span>Time</span><span>When to send</span></div>',
        '  <input type="time" value="' + (ws.time || "20:00") + '" data-field="weeklyTime" class="setting-input">',
        '</div>'
      ].join("")
    });
  }

  /* =========================================================
     Activity Reminders
     ========================================================= */
  function renderActivityRemindersGroup(state) {
    const activities = (state.activities || []).filter(function (a) { return !a.paused; });

    const enabledCount = activities.filter(function (a) {
      const r = (state.reminders || []).find(function (x) {
        return x.type === "activity" && x.sourceId === a.id;
      });
      return r && r.enabled;
    }).length;

    const summary = activities.length
      ? (activities.length + " activities · " + enabledCount + " reminders on")
      : "No activities yet";

    const listHTML = activities.length ? activities.map(function (a) {
      const r = (state.reminders || []).find(function (x) {
        return x.type === "activity" && x.sourceId === a.id;
      });
      const enabled = !!(r && r.enabled);
      const time = (r && r.time) || (a.reminder && a.reminder.time) || "09:00";

      return [
        '<div class="setting-row">',
        '  <div class="setting-row-label">',
        '    <span>' + escapeHtml(a.icon) + ' ' + escapeHtml(a.name) + '</span>',
        '    <span>' + escapeHtml(String(a.targetValue)) + ' ' + escapeHtml(a.targetUnit || "") + ' / ' + a.targetPeriod + '</span>',
        '  </div>',
        '  <div style="display:flex;gap:6px;align-items:center">',
        '    <input type="time" value="' + time + '" data-activity-time="' + a.id + '" class="setting-input-sm">',
        switchEl("act-" + a.id, enabled),
        '  </div>',
        '</div>'
      ].join("");
    }).join("") : '<div class="prog-empty"><strong>No activities yet.</strong>Create activities to set reminders.</div>';

    return group({
      id: "activity-reminders",
      icon: "🎯",
      title: "Activity Reminders",
      summary: summary,
      body: listHTML
    });
  }

  /* =========================================================
     Data & Backup
     ========================================================= */
  function renderDataGroup() {
    return group({
      id: "data",
      icon: "💾",
      title: "Data & Backup",
      summary: "Export · Import · Reset",
      body: [
        '<div class="data-actions">',
        '  <button class="btn btn-ghost full" data-action="export">📤 Export Data</button>',
        '  <button class="btn btn-ghost full" data-action="import">📥 Import Data</button>',
        '  <button class="btn btn-danger full" data-action="reset">🗑️ Reset All Data</button>',
        '</div>',
        '<p style="font-size:11.5px;color:var(--text-3);margin-top:10px;line-height:1.5">',
        '  Data stored locally on your device. Export regularly to keep a backup.',
        '</p>'
      ].join("")
    });
  }

  /* =========================================================
     About
     ========================================================= */
  function renderAboutGroup() {
    const state = Storage.loadState();
    const schema = state.version || 5;

    return group({
      id: "about",
      icon: "ℹ️",
      title: "About",
      summary: "Version 1 · Schema v" + schema,
      body: [
        '<div class="setting-row">',
        '  <div class="setting-row-label"><span>Rutin Harian</span><span>Version 1 (Android Build)</span></div>',
        '</div>',
        '<div class="setting-row">',
        '  <div class="setting-row-label"><span>Data Schema</span><span>Version ' + schema + '</span></div>',
        '</div>',
        '<div class="setting-row">',
        '  <div class="setting-row-label"><span>Storage</span><span>Local Device</span></div>',
        '</div>'
      ].join("")
    });
  }

  /* =========================================================
     Switch helper
     ========================================================= */
  function switchEl(key, on) {
    return [
      '<label class="switch">',
      '  <input type="checkbox" data-toggle="' + key + '"' + (on ? " checked" : "") + '>',
      '  <span class="switch-track"><span class="switch-thumb"></span></span>',
      '</label>'
    ].join("");
  }

  /* =========================================================
     Wire events
     ========================================================= */
  function wireEvents(state) {
    const root = els.body;

    /* Group toggles */
    root.querySelectorAll("[data-group]").forEach(function (btn) {
      btn.addEventListener("click", function () { toggle(btn.dataset.group); });
    });

    /* Edit name */
    root.querySelectorAll("[data-edit-name]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        openEditName(state);
      });
    });

    /* Theme picker */
    root.querySelectorAll("[data-theme]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const s = Storage.loadState();
        s.settings = s.settings || {};
        s.settings.theme = btn.dataset.theme;
        Storage.saveState(s);
        applyTheme(btn.dataset.theme);
        render();
      });
    });

    /* Font picker */
    root.querySelectorAll("[data-font]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const s = Storage.loadState();
        s.settings = s.settings || {};
        s.settings.fontSize = btn.dataset.font;
        Storage.saveState(s);
        if (window.App && App.applyFontSize) App.applyFontSize(btn.dataset.font);
        render();
      });
    });

    /* Hour format picker */
    root.querySelectorAll("[data-hour]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const s = Storage.loadState();
        s.settings = s.settings || {};
        s.settings.hourFormat = btn.dataset.hour;
        Storage.saveState(s);
        render();
        if (window.App && App.refreshAll) App.refreshAll();
      });
    });

    /* Toggles */
    root.querySelectorAll("[data-toggle]").forEach(function (input) {
      input.addEventListener("change", function () {
        handleToggle(input.dataset.toggle, input.checked);
      });
    });

    /* Field changes */
    root.querySelectorAll("[data-field]").forEach(function (input) {
      input.addEventListener("change", function () {
        const s = Storage.loadState();
        const field = input.dataset.field;
        s.settings = s.settings || {};
        s.settings.fastingReminders = s.settings.fastingReminders || {};
        s.settings.weeklySummaryReminder = s.settings.weeklySummaryReminder || {};

        if (field === "fastingStartTime")          s.settings.fastingReminders.startTime = input.value;
        else if (field === "fastingEndingAdvance") s.settings.fastingReminders.endingAdvanceMinutes = Number(input.value);
        else if (field === "weeklyDay")            s.settings.weeklySummaryReminder.day = Number(input.value);
        else if (field === "weeklyTime")           s.settings.weeklySummaryReminder.time = input.value;

        Storage.saveState(s);
      });
    });

    /* Activity reminder time */
    root.querySelectorAll("[data-activity-time]").forEach(function (input) {
      input.addEventListener("change", function () {
        const activityId = input.dataset.activityTime;
        const s = Storage.loadState();
        if (typeof Reminders !== "undefined") {
          Reminders.upsertForActivity(s, activityId, { time: input.value });
        }
      });
    });

    /* Android app actions */
    root.querySelectorAll("[data-native]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (typeof Native === "undefined") return;
        if (btn.dataset.native === "test") Native.testNotification().then(render);
        if (btn.dataset.native === "perm") Native.requestPermission().then(function (p) {
          if (p !== "granted") {
            alert("Notifications are blocked. Open Android Settings → Apps → Rutin Harian → Notifications and turn them on.");
          }
          render();
        });
      });
    });

    /* Data actions */
    root.querySelectorAll("[data-action]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (btn.dataset.action === "export") Backup.exportNow();
        if (btn.dataset.action === "import") Backup.openImportDialog();
        if (btn.dataset.action === "reset")  Backup.openResetDialog();
      });
    });
  }

  /* =========================================================
     Toggle handler
     ========================================================= */
  function handleToggle(key, value) {
    const s = Storage.loadState();
    s.settings = s.settings || {};
    s.settings.reminderPrefs = s.settings.reminderPrefs || {};
    s.settings.fastingReminders = s.settings.fastingReminders || {};
    s.settings.weeklySummaryReminder = s.settings.weeklySummaryReminder || {};

    if (key === "master") {
      s.settings.remindersEnabled = value;
    }
    else if (key === "activity") {
      s.settings.reminderPrefs.activity = value;
    }
    else if (key === "fasting") {
      s.settings.reminderPrefs.fastingStart = value;
      s.settings.reminderPrefs.fastingEnding = value;
      s.settings.reminderPrefs.fastingComplete = value;
    }
    else if (key === "todo") {
      s.settings.reminderPrefs.todo = value;
    }
    else if (key === "weekly") {
      s.settings.reminderPrefs.weeklySummary = value;
    }
    else if (key === "fastStart")    { s.settings.fastingReminders.startEnabled = value; }
    else if (key === "fastEnding")   { s.settings.fastingReminders.endingEnabled = value; }
    else if (key === "fastComplete") { s.settings.fastingReminders.completeEnabled = value; }
    else if (key === "weeklyEnabled"){ s.settings.weeklySummaryReminder.enabled = value; }
    else if (key === "liveTimer")    { s.settings.liveTimer = value; }
    else if (key === "haptics")      { s.settings.haptics = value; }
    else if (key.indexOf("act-") === 0) {
      const activityId = key.slice(4);
      const existing = (s.reminders || []).find(function (r) {
        return r.type === "activity" && r.sourceId === activityId;
      });
      if (existing) {
        existing.enabled = value;
        if (value) existing.lastFiredKey = null;
      } else if (value) {
        const activity = (s.activities || []).find(function (a) { return a.id === activityId; });
        if (activity && window.Reminders) {
          Reminders.upsertForActivity(s, activityId, {
            enabled: true,
            time: (activity.reminder && activity.reminder.time) || "09:00",
            days: activity.schedule === "selectedDays" ? (activity.days || []) : []
          });
        }
      }
    }

    Storage.saveState(s);
    render();
  }

  /* =========================================================
     Edit name
     ========================================================= */
  function openEditName(state) {
    Sheet.open({
      title: "Display Name",
      body: [
        '<label class="field">',
        '  <span>Name</span>',
        '  <input id="p-name" type="text" value="' + escapeAttr((state.user && state.user.name) || "Friend") + '" maxlength="40">',
        '</label>'
      ].join(""),
      actions: [
        { label: "Cancel", kind: "ghost" },
        { label: "Save", kind: "primary", onClick: function () {
          const v = document.getElementById("p-name").value.trim() || "Friend";
          const s = Storage.loadState();
          s.user = s.user || {};
          s.user.name = v;
          Storage.saveState(s);
          render();
          if (window.App && App.refreshAll) App.refreshAll();
        }}
      ]
    });
  }

  /* =========================================================
     Theme
     ========================================================= */
  function applyTheme(theme) {
    const body = document.body;
    body.classList.remove("light", "system");
    if (theme === "light") body.classList.add("light");
    if (theme === "system") {
      if (window.matchMedia("(prefers-color-scheme: light)").matches) {
        body.classList.add("light");
      }
    }
  }

  /* =========================================================
     Utils
     ========================================================= */
  function escapeHtml(str) {
    return String(str || "").replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }
  function escapeAttr(str) {
    return escapeHtml(str).replace(/"/g, "&quot;");
  }

  return { init: init, refresh: refresh, applyTheme: applyTheme };
})();

window.Profile = Profile;  /* expose for window.Profile checks in other modules */
