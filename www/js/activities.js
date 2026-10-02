/* =========================================================
   activities.js — CRUD + progress + rendering.
   Phase 2.2: active activity timer with cancel + finish.
   ========================================================= */

const Activities = (() => {

  /* ---------- CRUD ---------- */
  function createActivity(state, data) {
    const activity = normalize(data);
    activity.id = Storage.uid();
    activity.createdAt = Date.now();
    state.activities.push(activity);
    Storage.saveState(state);
    return activity;
  }

  function updateActivity(state, id, patch) {
    const idx = state.activities.findIndex(a => a.id === id);
    if (idx < 0) return null;
    const merged = { ...state.activities[idx], ...patch };
    if (patch.reminder) merged.reminder = { ...state.activities[idx].reminder, ...patch.reminder };
    state.activities[idx] = merged;
    Storage.saveState(state);
    return merged;
  }

  function deleteActivity(state, id) {
    state.activities = state.activities.filter(a => a.id !== id);
    Storage.saveState(state);
  }

  function pauseActivity(state, id, paused = true) {
    return updateActivity(state, id, { paused });
  }

  function getById(state, id) {
    return state.activities.find(a => a.id === id) || null;
  }

  function normalize(data) {
    return {
      name:         (data.name || "New Activity").trim(),
      icon:         data.icon || "⭐",
      sub:          data.sub  || "",
      trackingType: data.trackingType || "duration",
      targetValue:  Number(data.targetValue) || 1,
      targetUnit:   data.targetUnit || "minutes",
      customUnit:   data.customUnit || "",
      targetPeriod: data.targetPeriod || "day",
      schedule:     data.schedule || "everyday",
      days:         Array.isArray(data.days) ? data.days : [],
      reminder:     data.reminder || { enabled: false, time: "09:00" },
      paused:       !!data.paused
    };
  }

  /* ---------- Progress ---------- */
  function addActivityProgress(state, id, amount, date = new Date()) {
    const activity = getById(state, id);
    if (!activity) return;
    const current = Storage.getProgressValue(state, activity, date);
    const next    = Math.min(activity.targetValue, Math.max(0, current + amount));
    Storage.setProgress(state, activity, next, date);
    Storage.saveState(state);

    /* XP for finishing a goal */
    if (next >= activity.targetValue && current < activity.targetValue) {
      awardForCompletion(state, activity);
    }
  }

  function awardForCompletion(state, activity) {
    const key = Storage.currentPeriodKey(activity);
    if (activity.targetPeriod === "day")       XP.awardDailyActivity(state, activity.id + ":" + key);
    else if (activity.targetPeriod === "week")  XP.awardWeeklyGoal(state, activity.id, key);
    else if (activity.targetPeriod === "month") XP.awardMonthlyGoal(state, activity.id, key);
    else if (activity.targetPeriod === "year")  XP.awardYearlyGoal(state, activity.id, key);
  }

  function getProgress(state, activity, date = new Date()) {
    const current = Storage.getProgressValue(state, activity, date);
    const target  = activity.targetValue || 1;
    const percent = Math.min(100, Math.round((current / target) * 100));
    const done    = current >= target;
    return { current, target, percent, done };
  }

  /* ---------- Scheduling ---------- */
  function isScheduledForDate(activity, date = new Date()) {
    if (activity.paused) return false;
    if (activity.targetPeriod !== "day") return true;
    if (activity.schedule === "everyday") return true;
    return activity.days.includes(date.getDay());
  }

  function getActivitiesForDate(state, date = new Date()) {
    return state.activities.filter(a => isScheduledForDate(a, date));
  }

  function unitLabel(activity) {
    if (activity.targetUnit === "custom") return activity.customUnit || "units";
    return activity.targetUnit;
  }

  function targetLabel(activity) {
    const unit = unitLabel(activity);
    return `${activity.targetValue} ${unit} / ${activity.targetPeriod}`;
  }

  /* ---------- Active timer ---------- */
  function startActivityTimer(state, activityId) {
    state.activeActivity = {
      activityId,
      startTs: Date.now(),
      accumulatedMs: 0
    };
    Storage.saveState(state);
  }

  function getActiveActivity(state) {
    if (!state.activeActivity) return null;
    const activity = getById(state, state.activeActivity.activityId);
    if (!activity) {
      state.activeActivity = null;
      Storage.saveState(state);
      return null;
    }
    const elapsedMs = (Date.now() - state.activeActivity.startTs)
                    + (state.activeActivity.accumulatedMs || 0);
    return { activity, elapsedMs, startTs: state.activeActivity.startTs };
  }

  function finishActivityTimer(state, mode = "add") {
    const active = state.activeActivity;
    if (!active) return null;
    const activity = getById(state, active.activityId);
    if (!activity) { state.activeActivity = null; Storage.saveState(state); return null; }

    const elapsedMs = (Date.now() - active.startTs) + (active.accumulatedMs || 0);
    const elapsedMinutes = Math.max(1, Math.round(elapsedMs / 60000));

    state.activeActivity = null;

    if (mode === "add") {
      addActivityProgress(state, activity.id, elapsedMinutes);
    }
    Storage.saveState(state);
    return { activity, elapsedMs, elapsedMinutes, mode };
  }

  function cancelActivityTimer(state) {
    state.activeActivity = null;
    Storage.saveState(state);
  }

  /* ---------- Rendering ---------- */
  function renderCard(state, activity, date = new Date()) {
    const p = getProgress(state, activity, date);
    const isActive = state.activeActivity
      && state.activeActivity.activityId === activity.id;

    const card = document.createElement("article");
    card.className = "card activity-card" + (p.done ? " done" : "");
    card.dataset.id = activity.id;

    const top = document.createElement("div");
    top.className = "activity-top";
    top.innerHTML = `
      <div class="activity-icon">${escapeHtml(activity.icon)}</div>
      <div class="activity-meta">
        <div class="activity-name">${escapeHtml(activity.name)}</div>
        <div class="activity-target">${escapeHtml(targetLabel(activity).toUpperCase())}</div>
      </div>
      <button class="icon-btn" data-action="edit" aria-label="Edit activity">⋯</button>
    `;
    card.appendChild(top);

    if (isActive) {
      card.appendChild(renderActiveBlock(state, activity));
    } else {
      if (activity.trackingType === "counter")
        card.appendChild(renderCounterBlock(activity, p));
      else if (activity.trackingType === "checklist")
        card.appendChild(renderChecklistBlock(activity, p));
      else
        card.appendChild(renderDurationBlock(activity, p));

      card.appendChild(renderActions(activity, p));
    }
    return card;
  }

  function renderActiveBlock(state, activity) {
    const active = state.activeActivity;
    const wrap = document.createElement("div");
    wrap.className = "activity-progress";
    const elapsedMs = (Date.now() - active.startTs) + (active.accumulatedMs || 0);
    wrap.innerHTML = `
      <div class="progress-line">
        <span class="progress-value">${formatHMS(elapsedMs)}</span>
        <span class="progress-unit">elapsed</span>
      </div>
      <div class="activity-actions" style="margin-top:6px">
        <button class="btn btn-ghost" data-action="active-options">•••</button>
        <button class="btn btn-primary" data-action="active-finish">✓ Finish</button>
      </div>
    `;
    return wrap;
  }

  function formatHMS(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = String(Math.floor(total / 3600)).padStart(2, "0");
    const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
    const s = String(total % 60).padStart(2, "0");
    return `${h}:${m}:${s}`;
  }

  function renderDurationBlock(activity, p) {
    const wrap = document.createElement("div");
    wrap.className = "activity-progress";
    wrap.innerHTML = `
      <div class="progress-line">
        <span class="progress-value">${p.current} / ${p.target}</span>
        <span class="progress-unit">${escapeHtml(unitLabel(activity))}</span>
      </div>
      <div class="bar"><div class="bar-fill" style="width:${p.percent}%"></div></div>
    `;
    return wrap;
  }

  function renderCounterBlock(activity, p) {
    const wrap = document.createElement("div");
    wrap.className = "activity-progress";
    const maxDots = Math.min(p.target, 20);
    const dots = Array.from({ length: maxDots }, (_, i) =>
      `<span class="dot ${i < p.current ? "filled" : ""}"></span>`).join("");
    wrap.innerHTML = `
      <div class="dots">${dots}</div>
      <div class="progress-line">
        <span class="progress-value">${p.current} / ${p.target}</span>
        <span class="progress-unit">completed</span>
      </div>
    `;
    return wrap;
  }

  function renderChecklistBlock(activity, p) {
    const wrap = document.createElement("div");
    wrap.className = "activity-progress";
    wrap.innerHTML = `
      <div class="progress-line">
        <span class="progress-value">${p.done ? "Completed ✓" : "Not yet"}</span>
      </div>
    `;
    return wrap;
  }

  function renderActions(activity, p) {
    const actions = document.createElement("div");
    actions.className = "activity-actions";

    if (activity.trackingType === "duration") {
      const step = activity.targetUnit === "hours" ? 1 : 5;
      actions.innerHTML = `
        <button class="btn btn-ghost" data-action="start" ${p.done ? "disabled" : ""}>▶ Start</button>
        <button class="btn btn-primary" data-action="add" ${p.done ? "disabled" : ""}>+${step} ${escapeHtml(unitLabel(activity))}</button>
      `;
    } else if (activity.trackingType === "counter") {
      actions.innerHTML = `
        <button class="btn btn-primary btn-block" data-action="add" ${p.done ? "disabled" : ""}>+ Add Progress</button>
      `;
    } else {
      actions.innerHTML = `
        <button class="btn ${p.done ? "btn-success" : "btn-primary"} btn-block" data-action="toggle">
          ${p.done ? "✓ Completed" : "Mark Complete"}
        </button>
      `;
    }
    return actions;
  }

  /* ---------- Interaction ---------- */
  function handleAction(state, activity, action) {
    if (action === "add") {
      const step = activity.trackingType === "duration"
        ? (activity.targetUnit === "hours" ? 1 : 5)
        : 1;
      addActivityProgress(state, activity.id, step);
    } else if (action === "start") {
      startActivityTimer(state, activity.id);
    } else if (action === "toggle") {
      const p = getProgress(state, activity);
      const current = Storage.getProgressValue(state, activity);
      Storage.setProgress(state, activity, p.done ? 0 : activity.targetValue);
      Storage.saveState(state);
      if (!p.done && current < activity.targetValue) awardForCompletion(state, activity);
    }
  }

  /* ---------- Utility ---------- */
  function escapeHtml(str = "") {
    return String(str).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  return {
    createActivity, updateActivity, deleteActivity, pauseActivity,
    getById, addActivityProgress, getProgress,
    isScheduledForDate, getActivitiesForDate,
    targetLabel, unitLabel, renderCard, handleAction,
    startActivityTimer, getActiveActivity, finishActivityTimer, cancelActivityTimer,
    formatHMS, normalize
  };
})();