/* =========================================================
   storage.js — V5 schema
   Migrations V1 → V2 → V3 → V4 → V5
   ========================================================= */

const STORAGE_KEY = "routineFast.v1";

const SEED_ACTIVITIES = [
  {
    id: "a-exercise",
    name: "Exercise",
    icon: "🚶",
    sub: "Brisk Walk / Strength Training",
    trackingType: "duration",
    targetValue: 30,
    targetUnit: "minutes",
    customUnit: "",
    targetPeriod: "day",
    schedule: "everyday",
    days: [],
    reminder: { enabled: true, time: "07:00" },
    paused: false,
    createdAt: Date.now()
  },
  {
    id: "a-reading",
    name: "Reading",
    icon: "📖",
    sub: "Book / eBook / Al-Quran",
    trackingType: "duration",
    targetValue: 30,
    targetUnit: "minutes",
    customUnit: "",
    targetPeriod: "day",
    schedule: "everyday",
    days: [],
    reminder: { enabled: true, time: "21:00" },
    paused: false,
    createdAt: Date.now()
  },
  {
    id: "a-shopee",
    name: "Shopee / Affiliate",
    icon: "🛍️",
    sub: "Weekly activity goal",
    trackingType: "counter",
    targetValue: 5,
    targetUnit: "times",
    customUnit: "",
    targetPeriod: "week",
    schedule: "everyday",
    days: [],
    reminder: { enabled: false, time: "12:00" },
    paused: false,
    createdAt: Date.now()
  }
];

const DEFAULT_SETTINGS = {
  theme: "dark",              // dark | light | system
  fontSize: "medium",         // small | medium | large | xlarge
  hourFormat: "24h",          // 24h | 12h
  defaultFastingPlan: "16:8",
  remindersEnabled: true,
  reminderPrefs: {
    activity:        true,
    fastingStart:    true,
    fastingEnding:   true,
    fastingComplete: true,
    todo:            true,
    weeklySummary:   true
  },
  fastingReminders: {
    startTime:    "20:00",
    startEnabled: true,
    endingEnabled: true,
    endingAdvanceMinutes: 30,
    completeEnabled: true
  },
  weeklySummaryReminder: {
    enabled: true,
    day: 0,
    time:  "20:00"
  }
};

const DEFAULT_STATE = {
  version: 5,
  user:     { name: "Friend", theme: "dark" },
  settings: structuredClone(DEFAULT_SETTINGS),

  activities: structuredClone(SEED_ACTIVITIES),

  progress: {},
  dailyLog: {},
  activitySnapshots: {},

  activeActivity: null,

  fasting: {
    active: null,
    sessions: [],
    achievements: {}
  },

  todos: [],
  notes: [],
  reminders: [],

  xp: {
    total: 0,
    log: []
  },
  achievements: {},
  badges: {},
  streak: { current: 0, best: 0, lastCompletedDate: null }
};

/* =========================================================
   Load / save / reset
   ========================================================= */
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    return migrate(JSON.parse(raw));
  } catch (e) {
    console.error("[storage] load failed:", e);
    return structuredClone(DEFAULT_STATE);
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error("[storage] save failed:", e);
  }
}

function resetState() {
  localStorage.removeItem(STORAGE_KEY);
  return structuredClone(DEFAULT_STATE);
}

/* =========================================================
   Migration V1 → V2 → V3 → V4 → V5
   ========================================================= */
function migrate(old) {
  if (!old || typeof old !== "object") return structuredClone(DEFAULT_STATE);

  if (old.version === 5 && Array.isArray(old.activities)) {
    return {
      ...structuredClone(DEFAULT_STATE),
      ...old,
      user:     { ...DEFAULT_STATE.user,     ...(old.user     || {}) },
      settings: deepMergeSettings(DEFAULT_SETTINGS, old.settings || {}),
      fasting:  { ...DEFAULT_STATE.fasting,  ...(old.fasting  || {}) },
      streak:   { ...DEFAULT_STATE.streak,   ...(old.streak   || {}) },
      xp:       { ...DEFAULT_STATE.xp,       ...(old.xp       || {}) },
      activitySnapshots: old.activitySnapshots || {},
      todos: Array.isArray(old.todos) ? old.todos : [],
      notes: Array.isArray(old.notes) ? old.notes : [],
      reminders: Array.isArray(old.reminders) ? old.reminders : [],
      achievements: old.achievements || {},
      badges: old.badges || {},
      activeActivity: old.activeActivity || null
    };
  }

  if (old.version === 4 && Array.isArray(old.activities)) {
    return {
      ...structuredClone(DEFAULT_STATE),
      ...old,
      version: 5,
      user:     { ...DEFAULT_STATE.user,     ...(old.user     || {}) },
      settings: deepMergeSettings(DEFAULT_SETTINGS, old.settings || {}),
      fasting:  { ...DEFAULT_STATE.fasting,  ...(old.fasting  || {}) },
      streak:   { ...DEFAULT_STATE.streak,   ...(old.streak   || {}) },
      xp:       { ...DEFAULT_STATE.xp,       ...(old.xp       || {}) },
      activitySnapshots: old.activitySnapshots || {},
      todos: Array.isArray(old.todos) ? old.todos : [],
      notes: Array.isArray(old.notes) ? old.notes : [],
      reminders: [],
      achievements: old.achievements || {},
      badges: old.badges || {},
      activeActivity: old.activeActivity || null
    };
  }

  if (old.version === 3 && Array.isArray(old.activities)) {
    return {
      ...structuredClone(DEFAULT_STATE),
      ...old,
      version: 5,
      user:     { ...DEFAULT_STATE.user,     ...(old.user     || {}) },
      settings: deepMergeSettings(DEFAULT_SETTINGS, old.settings || {}),
      fasting:  { ...DEFAULT_STATE.fasting,  ...(old.fasting  || {}) },
      streak:   { ...DEFAULT_STATE.streak,   ...(old.streak   || {}) },
      xp:       { ...DEFAULT_STATE.xp },
      activitySnapshots: old.activitySnapshots || {},
      todos: Array.isArray(old.todos) ? old.todos : [],
      notes: Array.isArray(old.notes) ? old.notes : [],
      reminders: [],
      achievements: old.achievements || {},
      badges: old.badges || {},
      activeActivity: old.activeActivity || null
    };
  }

  if (old.version === 2 && Array.isArray(old.activities)) {
    return {
      ...structuredClone(DEFAULT_STATE),
      ...old,
      version: 5,
      user:     { ...DEFAULT_STATE.user,     ...(old.user     || {}) },
      settings: structuredClone(DEFAULT_SETTINGS),
      fasting:  { ...DEFAULT_STATE.fasting,  ...(old.fasting  || {}) },
      streak:   { ...DEFAULT_STATE.streak,   ...(old.streak   || {}) },
      activitySnapshots: old.activitySnapshots || {},
      todos: [], notes: [], reminders: [],
      xp: { total: 0, log: [] },
      achievements: old.achievements || {},
      badges: old.badges || {},
      activeActivity: null
    };
  }

  /* V1 → V5 */
  const next = structuredClone(DEFAULT_STATE);
  next.activities = [];
  next.progress = {};
  next.dailyLog = {};
  next.activitySnapshots = {};
  next.todos = [];
  next.notes = [];
  next.reminders = [];
  next.xp = { total: 0, log: [] };
  next.achievements = {};
  next.badges = {};
  next.activeActivity = null;
  next.settings = structuredClone(DEFAULT_SETTINGS);

  if (Array.isArray(old.routines) && old.routines.length) {
    next.activities = old.routines.map(r => ({
      id:           r.id || uid(),
      name:         r.name || "Activity",
      icon:         r.icon || "⭐",
      sub:          r.sub  || "",
      trackingType: r.type === "duration" ? "duration"
                  : r.type === "counter"  ? "counter"
                  : "checklist",
      targetValue:  r.target || 1,
      targetUnit:   r.unit   || "times",
      customUnit:   "",
      targetPeriod: r.frequency === "weekly" ? "week" : "day",
      schedule:     r.frequency === "selectedDays" ? "selectedDays" : "everyday",
      days:         r.days || [],
      reminder:     r.reminder || { enabled: false, time: "09:00" },
      paused:       !!r.paused,
      createdAt:    Date.now()
    }));
  }

  if (old.daily && typeof old.daily === "object") {
    for (const [dateKey, day] of Object.entries(old.daily)) {
      next.dailyLog[dateKey] = { ...(day.routines || {}) };
      const date = new Date(dateKey);
      for (const [aid, value] of Object.entries(day.routines || {})) {
        const act = next.activities.find(a => a.id === aid);
        if (!act) continue;
        const bucket = periodKeyForDate(act.targetPeriod, date);
        next.progress[bucket] = next.progress[bucket] || {};
        next.progress[bucket][aid] = (next.progress[bucket][aid] || 0) + value;
      }
    }
  }

  if (old.streak)       next.streak       = { ...next.streak, ...old.streak };
  if (old.achievements) next.achievements = old.achievements;
  if (old.badges)       next.badges       = old.badges;

  return next;
}

/* Deep-merge settings so new keys appear without wiping user prefs */
function deepMergeSettings(defaults, incoming) {
  const out = structuredClone(defaults);
  for (const key of Object.keys(incoming || {})) {
    const v = incoming[key];
    if (v && typeof v === "object" && !Array.isArray(v)) {
      out[key] = { ...(out[key] || {}), ...v };
    } else {
      out[key] = v;
    }
  }
  return out;
}

/* =========================================================
   Period helpers
   ========================================================= */
function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return {
    week: Math.ceil((((d - yearStart) / 86400000) + 1) / 7),
    year: d.getUTCFullYear()
  };
}

function periodKeyForDate(period, date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  switch (period) {
    case "week":  { const { week, year } = isoWeek(date);
                    return `${year}-W${String(week).padStart(2, "0")}`; }
    case "month": return `${y}-${m}`;
    case "year":  return `${y}`;
    default:      return `${y}-${m}-${d}`;
  }
}

function currentPeriodKey(activity, date = new Date()) {
  return periodKeyForDate(activity.targetPeriod, date);
}

/* =========================================================
   Progress accessors
   ========================================================= */
function getProgressValue(state, activity, date = new Date()) {
  const key = currentPeriodKey(activity, date);
  return (state.progress[key] && state.progress[key][activity.id]) || 0;
}

function setProgress(state, activity, value, date = new Date()) {
  const key = currentPeriodKey(activity, date);
  state.progress[key] = state.progress[key] || {};
  state.progress[key][activity.id] = Math.max(0, value);

  const dKey = todayKey(date);
  state.dailyLog[dKey] = state.dailyLog[dKey] || {};
  state.dailyLog[dKey][activity.id] = state.progress[key][activity.id];

  snapshotActivity(state, activity, date);
}

function addProgress(state, activity, amount, date = new Date()) {
  const current = getProgressValue(state, activity, date);
  setProgress(state, activity, current + amount, date);
  return current + amount;
}

function snapshotActivity(state, activity, date = new Date()) {
  const day = todayKey(date);
  state.activitySnapshots[day] = state.activitySnapshots[day] || {};
  state.activitySnapshots[day][activity.id] = {
    name:         activity.name,
    icon:         activity.icon,
    trackingType: activity.trackingType,
    targetValue:  activity.targetValue,
    targetUnit:   activity.targetUnit,
    customUnit:   activity.customUnit,
    targetPeriod: activity.targetPeriod
  };
}

function getActivitySnapshot(state, activityId, dateKey) {
  const day = state.activitySnapshots[dateKey];
  return day ? day[activityId] || null : null;
}

function getFastingSessionsEndingOn(state, dateKey) {
  return state.fasting.sessions.filter(s => s.date === dateKey);
}

function getFastingSessionsStartingOn(state, dateKey) {
  return state.fasting.sessions.filter(s => {
    if (!s.startTs) return false;
    const startKey = todayKey(new Date(s.startTs));
    return startKey === dateKey && s.date !== dateKey;
  });
}

/* =========================================================
   Backup helpers
   ========================================================= */
function exportBackup() {
  return JSON.stringify({
    app: "RoutineFast",
    version: DEFAULT_STATE.version,
    exportedAt: new Date().toISOString(),
    state: loadState()
  }, null, 2);
}

function importBackup(json) {
  const parsed = typeof json === "string" ? JSON.parse(json) : json;
  if (!parsed || typeof parsed !== "object") throw new Error("Invalid backup");
  if (parsed.app !== "RoutineFast")          throw new Error("Not a RoutineFast backup");
  if (!parsed.state || typeof parsed.state !== "object")
                                             throw new Error("Missing state");

  const migrated = migrate(parsed.state);
  saveState(migrated);
  return migrated;
}

/* =========================================================
   Utils
   ========================================================= */
function uid() {
  return "id-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function exportState() { return JSON.stringify(loadState(), null, 2); }

window.Storage = {
  STORAGE_KEY, DEFAULT_STATE, DEFAULT_SETTINGS, SEED_ACTIVITIES,
  loadState, saveState, resetState,
  todayKey, isoWeek, periodKeyForDate, currentPeriodKey,
  getProgressValue, setProgress, addProgress,
  snapshotActivity, getActivitySnapshot,
  getFastingSessionsEndingOn, getFastingSessionsStartingOn,
  exportBackup, importBackup,
  uid, exportState
};