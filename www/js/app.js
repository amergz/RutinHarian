/* =========================================================
   app.js — orchestration layer
   Calendar.refresh() now reads from Storage (no arg)
   + Week preview ref added
   ========================================================= */

(function () {
  "use strict";
  if (window.__RF_BOOTED__) return;
  window.__RF_BOOTED__ = true;

  let state = Storage.loadState();
  let achvQueue = [];
  let activityTickHandle = null;

  const uiPrefs = {
    showAllActivities: false
  };

  const els = {
    navButtons:    document.querySelectorAll(".nav-btn"),
    panels:        document.querySelectorAll(".tab-panel"),
    appGreeting:   document.getElementById("app-greeting"),
    todayDate:     document.getElementById("today-date"),
    dailyProgress: document.getElementById("daily-progress"),
    streakValue:   document.getElementById("streak-value"),
    heroRing:      document.getElementById("hero-ring"),
    heroCount:     document.getElementById("hero-count"),
    activityList:  document.getElementById("activity-list"),
    emptyState:    document.getElementById("empty-state"),
    addBtn:        document.getElementById("add-activity-btn"),
    emptyAddBtn:   document.getElementById("empty-add-btn"),
    sectionToggle: document.querySelector("[data-toggle-activities]"),
    fastingIdle:   document.getElementById("fasting-idle"),
    fastingActive: document.getElementById("fasting-active"),
    fastingHistory:document.getElementById("fasting-history"),
    fastingGraph:  document.getElementById("fasting-graph-wrap"),
    openFastingBtn:document.getElementById("open-fasting-btn"),
    calendar: {
      prev:        document.getElementById("cal-prev"),
      next:        document.getElementById("cal-next"),
      monthLabel:  document.getElementById("cal-month-label"),
      todayBtn:    document.getElementById("cal-today"),
      grid:        document.getElementById("cal-grid"),
      detail:      document.getElementById("cal-detail"),
      collapse:    document.getElementById("cal-collapse"),
      collapsible: document.getElementById("cal-collapsible"),
      weekPreview: document.getElementById("cal-week-preview")
    },
    progressBody: document.getElementById("progress-body"),
    profileBody:  document.getElementById("profile-body")
  };

  /* ---------- Font size ---------- */
  function applyFontSize(size) {
    size = size || "medium";
    document.documentElement.setAttribute("data-font-size", size);
    document.body.classList.remove("font-small", "font-medium", "font-large", "font-xlarge");
    document.body.classList.add("font-" + size);
  }
  function loadFontSize() {
    const s = Storage.loadState();
    const size = (s.settings && s.settings.fontSize) || "medium";
    applyFontSize(size);
  }

  /* ---------- Navigation ---------- */
  function switchTab(name) {
    els.navButtons.forEach(function (b) {
      const active = b.dataset.tab === name;
      b.classList.toggle("active", active);
      b.setAttribute("aria-selected", active ? "true" : "false");
    });
    els.panels.forEach(function (p) {
      p.classList.toggle("active", p.id === "tab-" + name);
    });

    if (name === "progress" && typeof Progress !== "undefined") {
      Progress.refresh();
    }
    if (name === "calendar" && typeof Calendar !== "undefined") {
      Calendar.refresh();
    }
    if (name === "profile" && typeof Profile !== "undefined") {
      Profile.refresh();
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  els.navButtons.forEach(function (b) {
    b.addEventListener("click", function () { switchTab(b.dataset.tab); });
  });

  /* ---------- Greeting ---------- */
  function greetingByHour(h) {
    if (h < 5)  return "Selamat malam";
    if (h < 12) return "Selamat pagi";
    if (h < 15) return "Selamat tengah hari";
    if (h < 19) return "Selamat petang";
    return "Selamat malam";
  }
  function renderAppHeader() {
    if (!els.appGreeting) return;
    const name = (state.user && state.user.name ? state.user.name : "Friend").trim();
    els.appGreeting.textContent = greetingByHour(new Date().getHours()) + ", " + name;
  }

  /* ---------- Header ---------- */
  function renderHeader() {
    const now = new Date();
    if (els.todayDate) {
      els.todayDate.textContent = now.toLocaleDateString(undefined, {
        weekday: "long", day: "numeric", month: "long"
      });
    }
    const dayGoals = Activities.getActivitiesForDate(state, now)
      .filter(function (a) { return a.targetPeriod === "day"; });
    let sum = 0;
    let doneCount = 0;
    dayGoals.forEach(function (a) {
      const p = Activities.getProgress(state, a, now);
      sum += p.percent;
      if (p.done) doneCount++;
    });
    const overall = dayGoals.length ? Math.round(sum / dayGoals.length) : 0;
    if (els.dailyProgress) els.dailyProgress.textContent = overall + "%";
    if (els.heroRing) {
      els.heroRing.style.setProperty("--p", Math.min(100, Math.max(0, overall)));
      els.heroRing.classList.toggle("complete", dayGoals.length > 0 && overall >= 100);
      els.heroRing.setAttribute("aria-label", "Daily progress " + overall + "%");
    }
    if (els.heroCount) {
      els.heroCount.textContent = dayGoals.length
        ? doneCount + " of " + dayGoals.length + " daily goals done"
        : "No daily goals today";
    }
    if (els.streakValue)   els.streakValue.textContent = "🔥 " + (state.streak.current || 0) + " Day Streak";
  }

  /* ---------- Activities ---------- */
  function renderActivities() {
    const list = Activities.getActivitiesForDate(state, new Date());
    els.activityList.innerHTML = "";

    if (!state.activities.length) {
      els.emptyState.hidden = false;
      els.activityList.hidden = true;
      return;
    }
    els.emptyState.hidden = true;
    els.activityList.hidden = false;

    const compact = !uiPrefs.showAllActivities;
    els.activityList.classList.toggle("compact", compact);

    if (els.sectionToggle) {
      const labelEl = els.sectionToggle.querySelector(".toggle-label");
      if (labelEl) labelEl.textContent = compact ? "Show all" : "Show less";
      els.sectionToggle.classList.toggle("open", !compact);
    }

    const activeId = state.activeActivity ? state.activeActivity.activityId : null;

    list.forEach(function (activity) {
      const card = Activities.renderCard(state, activity);
      if (activity.id === activeId) card.classList.add("is-active");

      card.addEventListener("click", function (e) {
        const btn = e.target.closest("[data-action]");
        if (!btn) {
          if (compact && activity.id !== activeId) {
            uiPrefs.showAllActivities = true;
            renderActivities();
          }
          return;
        }
        const action = btn.dataset.action;

        if (action === "edit") {
          ActivityModal.open(state, activity, function () {
            state = Storage.loadState();
            const a = Activities.getById(state, activity.id);
            if (a) {
              Storage.snapshotActivity(state, a);
              Storage.saveState(state);
            }
            syncActivityReminder(state, a);
            refresh();
          });
          return;
        }

        if (action === "active-options") {
          Sheet.openOptions({
            title: "Session Options",
            items: [
              { icon: "✏️", label: "Edit Activity", onClick: function () {
                  ActivityModal.open(state, activity, function () {
                    state = Storage.loadState(); refresh();
                  });
                }},
              { icon: "⚙️", label: "Adjust Session", onClick: function () {
                  Sheet.open({
                    title: "Adjust Session",
                    body: '<p class="confirm-text">The current session will continue running. Finish to add the elapsed time to progress.</p>',
                    actions: [{ label: "Close", kind: "ghost" }]
                  });
                }},
              { icon: "🗑️", label: "Cancel Session", kind: "danger", onClick: function () {
                  Sheet.confirm({
                    title: "Cancel session?",
                    message: "This will discard the running timer without recording progress.",
                    confirmLabel: "Cancel Session",
                    cancelLabel: "Keep",
                    confirmKind: "danger",
                    onConfirm: function () {
                      const s = Storage.loadState();
                      Activities.cancelActivityTimer(s);
                      state = Storage.loadState();
                      refresh();
                    }
                  });
                }}
            ]
          });
          return;
        }

        if (action === "active-finish") {
          const s = Storage.loadState();
          Activities.finishActivityTimer(s, "add");
          state = Storage.loadState();
          checkAchievements();
          refresh();
          return;
        }

        Activities.handleAction(state, activity, action);
        state = Storage.loadState();
        checkAchievements();
        refresh();
      });

      els.activityList.appendChild(card);
    });
  }

  if (els.sectionToggle) {
    els.sectionToggle.addEventListener("click", function () {
      uiPrefs.showAllActivities = !uiPrefs.showAllActivities;
      renderActivities();
    });
  }

  /* ---------- Add ---------- */
  function openAddModal() {
    ActivityModal.open(state, null, function () {
      state = Storage.loadState();
      refresh();
    });
  }
  if (els.addBtn)      els.addBtn.addEventListener("click", openAddModal);
  if (els.emptyAddBtn) els.emptyAddBtn.addEventListener("click", openAddModal);

  /* ---------- Fasting ---------- */
  function renderFasting() {
    if (typeof FastingUI === "undefined") return;
    FastingUI.init({
      idle:     els.fastingIdle,
      active:   els.fastingActive,
      history:  els.fastingHistory
    });
    FastingUI.render(state);
    if (typeof FastingGraph !== "undefined" && els.fastingGraph) {
      FastingGraph.init(els.fastingGraph);
    }
  }
  if (els.openFastingBtn) {
    els.openFastingBtn.addEventListener("click", function () {
      if (typeof FastingUI !== "undefined") FastingUI.openPlanPicker(state, false);
    });
  }

  /* ---------- Reminder sync ---------- */
  function syncActivityReminder(state, activity) {
    if (!activity || typeof Reminders === "undefined") return;
    if (activity.reminder && activity.reminder.enabled && activity.reminder.time) {
      Reminders.upsertForActivity(state, activity.id, {
        enabled: true,
        time: activity.reminder.time,
        days: activity.schedule === "selectedDays" ? (activity.days || []) : []
      });
    } else {
      const existing = (state.reminders || []).find(function (r) {
        return r.type === "activity" && r.sourceId === activity.id;
      });
      if (existing) {
        existing.enabled = false;
        Storage.saveState(state);
      }
    }
  }

  /* ---------- Achievements ---------- */
  function checkAchievements() {
    if (typeof Achievements === "undefined") return;
    const unlocked = Achievements.checkAll(state);
    if (unlocked.length) {
      achvQueue.push.apply(achvQueue, unlocked);
      if (achvQueue.length === unlocked.length) setTimeout(showNextAchievement, 300);
    }
  }
  function showNextAchievement() {
    if (!achvQueue.length) return;
    const badge = achvQueue.shift();
    Achievements.showUnlockPopup(badge);
    const host = document.getElementById("achievement-host");
    if (!host) return;
    const observer = new MutationObserver(function () {
      if (!host.innerHTML) {
        observer.disconnect();
        setTimeout(showNextAchievement, 300);
      }
    });
    observer.observe(host, { childList: true });
  }

  /* ---------- Refresh ---------- */
  function refresh() {
    renderAppHeader();
    renderHeader();
    renderActivities();
    renderFasting();
    if (typeof Calendar !== "undefined") Calendar.refresh();
    if (typeof Progress !== "undefined") Progress.refresh();
    if (typeof Profile !== "undefined" &&
        document.getElementById("tab-profile").classList.contains("active")) {
      Profile.refresh();
    }
    checkAchievements();
  }

  /* ---------- Activity tick ---------- */
  function startActivityTick() {
    if (activityTickHandle) return;
    activityTickHandle = setInterval(function () {
      if (!state.activeActivity) return;
      if (!document.getElementById("tab-today").classList.contains("active")) return;
      const card = els.activityList.querySelector('[data-id="' + state.activeActivity.activityId + '"]');
      if (!card) return;
      const valueEl = card.querySelector(".progress-value");
      if (!valueEl) return;
      const active = state.activeActivity;
      const ms = (Date.now() - active.startTs) + (active.accumulatedMs || 0);
      valueEl.textContent = Activities.formatHMS(ms);
    }, 1000);
  }

  /* ---------- Reminder scheduler ---------- */
  function ensureReminderScheduler(retries) {
    retries = retries == null ? 10 : retries;
    if (typeof Reminders !== "undefined" && typeof Reminders.startScheduler === "function") {
      try {
        Reminders.startScheduler();
        console.debug("[app] Reminder scheduler started");
        return true;
      } catch (e) { console.error("[app] Failed to start reminder scheduler:", e); }
    }
    if (retries > 0) setTimeout(function () { ensureReminderScheduler(retries - 1); }, 500);
    else console.error("[app] Reminder scheduler never started");
    return false;
  }

  /* ---------- Theme ---------- */
  function applyInitialTheme() {
    const s = Storage.loadState();
    const theme = (s.settings && s.settings.theme) || "dark";
    if (typeof Profile !== "undefined" && Profile.applyTheme) {
      Profile.applyTheme(theme);
    } else {
      document.body.classList.remove("light", "system");
      if (theme === "light") document.body.classList.add("light");
    }
  }

  /* ---------- Calendar collapse ---------- */
  function initCalendarCollapse() {
    const btn = els.calendar.collapse;
    const box = els.calendar.collapsible;
    if (!btn || !box) return;

    const saved = localStorage.getItem("routineFast.calCollapsed");
    if (saved === "true") {
      box.classList.add("collapsed");
      btn.setAttribute("aria-expanded", "false");
      const lbl = btn.querySelector(".cal-collapse-label");
      if (lbl) lbl.textContent = "Show calendar";
    }

    btn.addEventListener("click", function () {
      const isCollapsed = box.classList.toggle("collapsed");
      btn.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
      const lbl = btn.querySelector(".cal-collapse-label");
      if (lbl) lbl.textContent = isCollapsed ? "Show calendar" : "Hide calendar";
      localStorage.setItem("routineFast.calCollapsed", isCollapsed ? "true" : "false");
      /* Refresh Calendar to update week preview visibility */
      if (typeof Calendar !== "undefined") Calendar.refresh();
    });
  }

  /* ---------- Boot diag ---------- */
  function diagnose() {
    const missing = [];
    if (typeof Storage             === "undefined") missing.push("storage.js");
    if (typeof Activities          === "undefined") missing.push("activities.js");
    if (typeof Achievements        === "undefined") missing.push("achievements.js");
    if (typeof XP                  === "undefined") missing.push("xp.js");
    if (typeof Reminders           === "undefined") missing.push("reminders.js");
    if (typeof NotificationAdapter === "undefined") missing.push("notifications.js");
    if (typeof Calendar            === "undefined") missing.push("calendar.js");
    if (typeof Progress            === "undefined") missing.push("progress.js");
    if (typeof Profile             === "undefined") missing.push("profile.js");
    if (missing.length) console.warn("[app] Missing modules:", missing.join(", "));
    else                console.debug("[app] All modules loaded");
  }

  /* ---------- Public API ---------- */
  window.App = {
    refreshFastingOnly: function () {
      state = Storage.loadState();
      renderFasting();
      if (typeof Progress !== "undefined") Progress.refresh();
      if (typeof Calendar !== "undefined") Calendar.refresh();
    },
    queueAchievements: function (list) {
      if (!Array.isArray(list) || !list.length) return;
      achvQueue.push.apply(achvQueue, list);
      setTimeout(showNextAchievement, 300);
    },
    refreshAll: function () { state = Storage.loadState(); refresh(); },
    switchTab: switchTab,
    applyFontSize: applyFontSize
  };

  /* ---------- Boot ---------- */
  function boot() {
    diagnose();
    applyInitialTheme();
    loadFontSize();

    if (typeof Calendar !== "undefined") {
      try { Calendar.init(els.calendar, state); }
      catch (e) { console.error("[app] Calendar.init failed:", e); }
    }
    if (typeof Progress !== "undefined") {
      try { Progress.init({ body: els.progressBody }); }
      catch (e) { console.error("[app] Progress.init failed:", e); }
    }
    if (typeof Profile !== "undefined") {
      try { Profile.init({ body: els.profileBody }); }
      catch (e) { console.error("[app] Profile.init failed:", e); }
    }

    initCalendarCollapse();

    refresh();
    switchTab("today");
    startActivityTick();
    ensureReminderScheduler();

    setTimeout(checkAchievements, 500);
    /* Every minute: update greeting, and re-render everything when the
       date changes (app left open past midnight). */
    let lastDay = new Date().toDateString();
    setInterval(function () {
      renderAppHeader();
      const today = new Date().toDateString();
      if (today !== lastDay) {
        lastDay = today;
        state = Storage.loadState();
        refresh();
      }
    }, 60000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

})();