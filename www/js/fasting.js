/* =========================================================
   fasting.js — timestamp-based intermittent fasting engine.
   Phase 2.1 + 2.2 — editable start/end, edit active,
   delete active, edit historical, delete historical.
   ========================================================= */

const Fasting = (() => {

  const PRESETS = [
    { id: "12:12", fast: 12, eat: 12 },
    { id: "14:10", fast: 14, eat: 10 },
    { id: "16:8",  fast: 16, eat: 8  },
    { id: "18:6",  fast: 18, eat: 6  },
    { id: "20:4",  fast: 20, eat: 4  }
  ];

  const MILESTONES = [
    { from: 0,  to: 2,  icon: "🍽️", title: "Fed State",
      desc: "Food digestion and absorption are active. Blood glucose and insulin typically rise after eating." },
    { from: 2,  to: 5,  icon: "📉", title: "Blood Sugar Settling",
      desc: "Food absorption may begin slowing and glucose/insulin generally move back toward between-meal levels." },
    { from: 5,  to: 8,  icon: "🌙", title: "Post-Meal Phase",
      desc: "The body increasingly relies on stored energy and liver glycogen." },
    { from: 8,  to: 10, icon: "🔄", title: "Early Fasting",
      desc: "Insulin is generally lower and fat utilisation may begin increasing." },
    { from: 10, to: 12, icon: "🔥", title: "Fat Use Increasing",
      desc: "Glycogen use continues while fat utilisation gradually increases." },
    { from: 12, to: 18, icon: "⚡", title: "Metabolic Switch",
      desc: "The body may gradually shift toward greater use of fatty acids and ketones for energy. Timing varies between individuals." },
    { from: 18, to: 24, icon: "🔥", title: "Fat Oxidation Rising",
      desc: "Fat utilisation and ketone production may continue increasing." },
    { from: 24, to: 48, icon: "♻️", title: "Extended Fasting",
      desc: "Ketones may rise further and liver glycogen becomes lower. Individual responses vary; this is not a medical recommendation." },
    { from: 48, to: 72, icon: "🧬", title: "Prolonged Fast",
      desc: "Prolonged fasting. Consult a healthcare professional. Do not attempt without medical supervision." },
    { from: 72, to: Infinity, icon: "⚠️", title: "Extended Fast",
      desc: "Extended fasting carries health risks. This app does not encourage fasting this long." }
  ];

  function getActive(state) { return state.fasting.active; }
  function isFasting(state) { return !!state.fasting.active; }

  /* =========================================================
     Start / end
     ========================================================= */
  function startFasting(state, planId, customHours, startTsOverride) {
    if (state.fasting.active) return state.fasting.active;

    const preset = PRESETS.find(p => p.id === planId);
    const hours  = customHours != null ? customHours : (preset ? preset.fast : 16);

    const startTs  = startTsOverride != null ? startTsOverride : Date.now();
    const targetTs = startTs + hours * 3600 * 1000;

    let plan = planId;
    if (!preset || preset.fast !== hours) {
      plan = formatCustomLabel(hours);
    }

    state.fasting.active = {
      plan,
      durationHours: hours,
      startTs,
      targetTs,
      milestonesHit: []
    };
    Storage.saveState(state);
    return state.fasting.active;
  }

  function formatCustomLabel(hours) {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return m ? `CUSTOM • ${h}H ${m}M` : `CUSTOM • ${h}H`;
  }

  function endFasting(state, completed = null) {
    const a = state.fasting.active;
    if (!a) return null;

    const endTs       = Date.now();
    const actualMs    = endTs - a.startTs;
    const actualHours = +(actualMs / 3600000).toFixed(2);
    const isCompleted = completed != null ? completed : actualMs >= (a.targetTs - a.startTs);

    const session = {
      id:           "s-" + endTs.toString(36) + Math.random().toString(36).slice(2,5),
      startTs:      a.startTs,
      plannedEndTs: a.targetTs,
      endTs,
      plannedHours: a.durationHours,
      actualHours,
      plan:         a.plan,
      completed:    isCompleted,
      date:         Storage.todayKey(new Date(endTs))
    };
    state.fasting.sessions.push(session);
    state.fasting.active = null;
    Storage.saveState(state);

    /* XP for fasting */
    if (isCompleted) XP.awardFastingCompleted(state, session.id);
    else             XP.awardFastingEndedEarly(state, session.id);

    /* Achievements check */
    if (typeof Achievements !== "undefined") {
      const unlocked = Achievements.checkAll(state);
      if (unlocked.length && typeof App !== "undefined" && App.queueAchievements) {
        App.queueAchievements(unlocked);
      }
    }

    return { session, unlocked: [] };
  }

  /* =========================================================
     Edit / delete active fast
     ========================================================= */
  function updateActiveFast(state, patch) {
    const a = state.fasting.active;
    if (!a) return null;

    const startTs  = patch.startTs  != null ? patch.startTs  : a.startTs;
    const targetTs = patch.targetTs != null ? patch.targetTs : a.targetTs;
    if (targetTs <= startTs) return null;

    const hours  = (targetTs - startTs) / 3600000;
    const preset = PRESETS.find(p => Math.abs(p.fast - hours) < 0.01);
    const plan   = preset ? preset.id : formatCustomLabel(hours);

    state.fasting.active = {
      ...a,
      startTs,
      targetTs,
      durationHours: hours,
      plan
    };
    Storage.saveState(state);
    return state.fasting.active;
  }

  function deleteActiveFast(state) {
    state.fasting.active = null;
    Storage.saveState(state);
  }

  /* =========================================================
     Edit / delete historical session
     ========================================================= */
  function updateSession(state, id, patch) {
    const idx = state.fasting.sessions.findIndex(s => s.id === id);
    if (idx < 0) return null;
    const s = state.fasting.sessions[idx];

    const startTs = patch.startTs != null ? patch.startTs : s.startTs;
    const endTs   = patch.endTs   != null ? patch.endTs   : s.endTs;
    if (endTs <= startTs) return null;

    const actualHours = +((endTs - startTs) / 3600000).toFixed(2);
    const plannedHours = patch.plannedHours != null ? patch.plannedHours : s.plannedHours;
    const targetMs = startTs + plannedHours * 3600 * 1000;

    const preset = PRESETS.find(p => Math.abs(p.fast - plannedHours) < 0.01);
    const plan = preset ? preset.id : formatCustomLabel(plannedHours);

    state.fasting.sessions[idx] = {
      ...s,
      startTs,
      endTs,
      plannedHours,
      plannedEndTs: targetMs,
      actualHours,
      plan,
      completed: (endTs - startTs) >= (targetMs - startTs),
      date: Storage.todayKey(new Date(endTs))
    };
    Storage.saveState(state);
    return state.fasting.sessions[idx];
  }

  function deleteSession(state, id) {
    state.fasting.sessions = state.fasting.sessions.filter(s => s.id !== id);
    Storage.saveState(state);
  }

  /* =========================================================
     Status computation
     ========================================================= */
  function computeStatus(state, now = Date.now()) {
    const a = state.fasting.active;
    if (!a) return null;

    const totalMs   = a.targetTs - a.startTs;
    const elapsedMs = Math.max(0, now - a.startTs);
    const remainMs  = Math.max(0, a.targetTs - now);

    const progress      = Math.min(1, elapsedMs / totalMs);
    const percent       = Math.round(progress * 100);
    const elapsedHours  = elapsedMs / 3600000;
    const remainHours   = remainMs / 3600000;
    const complete      = elapsedMs >= totalMs;

    const currentStage = getStageAt(elapsedHours);
    const nextStage    = getNextStage(elapsedHours);
    const nextRemainMs = nextStage ? Math.max(0, nextStage.from * 3600000 - elapsedMs) : 0;

    return {
      plan:        a.plan,
      targetHours: a.durationHours,
      startTs:     a.startTs,
      targetTs:    a.targetTs,
      elapsedMs, remainMs,
      elapsedHours, remainHours,
      progress, percent, complete,
      currentStage, nextStage, nextRemainMs
    };
  }

  function getStageAt(hours) {
    return MILESTONES.find(m => hours >= m.from && hours < m.to)
        || MILESTONES[MILESTONES.length - 1];
  }
  function getNextStage(hours) { return MILESTONES.find(m => m.from > hours) || null; }
  function stageIndex(stage)   { return MILESTONES.indexOf(stage); }

  /* =========================================================
     Weekly / period queries
     ========================================================= */
  function sessionsThisWeek(state, now = new Date()) {
    const { week: wNow, year: yNow } = Storage.isoWeek(now);
    return state.fasting.sessions.filter(s => {
      const d = new Date(s.endTs);
      const { week, year } = Storage.isoWeek(d);
      return week === wNow && year === yNow;
    });
  }

  /* Sessions whose endTs falls within [fromTs, toTs) */
  function sessionsBetween(state, fromTs, toTs) {
    return state.fasting.sessions.filter(s =>
      s.endTs >= fromTs && s.endTs < toTs
    );
  }

  /* Sessions whose endTs falls on a specific dateKey */
  function sessionsEndingOn(state, dateKey) {
    return state.fasting.sessions.filter(s => s.date === dateKey);
  }

  /* =========================================================
     Formatters
     ========================================================= */
  function formatHMS(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = String(Math.floor(total / 3600)).padStart(2, "0");
    const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
    const s = String(total % 60).padStart(2, "0");
    return `${h}:${m}:${s}`;
  }
  function formatDuration(ms) {
    const total = Math.max(0, Math.floor(ms / 60000));
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (h && m) return `${h}h ${m}m`;
    if (h)      return `${h}h`;
    return `${m}m`;
  }
  function formatTime(ts) {
    return new Date(ts).toLocaleTimeString(undefined, {
      hour: "numeric", minute: "2-digit"
    });
  }

  return {
    PRESETS, MILESTONES,
    getActive, isFasting,
    startFasting, endFasting,
    updateActiveFast, deleteActiveFast,
    updateSession, deleteSession,
    computeStatus, getStageAt, getNextStage, stageIndex,
    sessionsThisWeek, sessionsBetween, sessionsEndingOn,
    formatHMS, formatDuration, formatTime,
    formatCustomLabel
  };
})();