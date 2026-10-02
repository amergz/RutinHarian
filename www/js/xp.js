/* =========================================================
   xp.js — light XP + level system (Phase 5, patched)
   -----------------------------------------------------------------
   FIX: duplicate guard now also prevents identical (reason, ref.type,
   ref.id) entries regardless of the exact same call being issued
   several times per second.
   ========================================================= */

const XP = (() => {

  const VALUES = {
    dailyActivity:    10,
    weeklyGoal:       50,
    monthlyGoal:     120,
    yearlyGoal:      300,
    fastCompleted:    30,
    fastEndedEarly:    5,
    badgeBonus:        0
  };

  const XP_PER_LEVEL = 300;

  function award(state, amount, reason, ref = null) {
    if (!amount || amount <= 0) return false;

    state.xp = state.xp || { total: 0, log: [] };
    state.xp.log = state.xp.log || [];

    if (ref && ref.type && ref.id) {
      const dup = state.xp.log.some(e =>
        e.ref &&
        e.ref.type === ref.type &&
        e.ref.id === ref.id &&
        e.reason === reason
      );
      if (dup) return false;
    }

    const entry = {
      id:     Storage.uid(),
      amount,
      reason,
      ref,
      ts:     Date.now()
    };
    state.xp.log.push(entry);
    state.xp.total = (state.xp.total || 0) + amount;

    Storage.saveState(state);
    return entry;
  }

  function levelInfo(totalXp) {
    const total = Math.max(0, totalXp | 0);
    const level = Math.floor(total / XP_PER_LEVEL) + 1;
    const intoLevel = total % XP_PER_LEVEL;
    const toNext = XP_PER_LEVEL - intoLevel;
    const percent = Math.round((intoLevel / XP_PER_LEVEL) * 100);
    return { level, totalXp: total, intoLevel, toNext, percent, perLevel: XP_PER_LEVEL };
  }

  function awardDailyActivity(state, activityId) {
    /* One award per (activity, day) — key includes today's date */
    const day = Storage.todayKey();
    return award(state, VALUES.dailyActivity, "Daily activity",
      { type: "activity", id: activityId + ":" + day });
  }

  function awardWeeklyGoal(state, activityId, periodKey) {
    return award(state, VALUES.weeklyGoal, "Weekly goal",
      { type: "goal-week", id: activityId + ":" + periodKey });
  }

  function awardMonthlyGoal(state, activityId, periodKey) {
    return award(state, VALUES.monthlyGoal, "Monthly goal",
      { type: "goal-month", id: activityId + ":" + periodKey });
  }

  function awardYearlyGoal(state, activityId, periodKey) {
    return award(state, VALUES.yearlyGoal, "Yearly goal",
      { type: "goal-year", id: activityId + ":" + periodKey });
  }

  function awardFastingCompleted(state, sessionId) {
    return award(state, VALUES.fastCompleted, "Fasting target",
      { type: "fast", id: sessionId });
  }

  function awardFastingEndedEarly(state, sessionId) {
    return award(state, VALUES.fastEndedEarly, "Fasting ended early",
      { type: "fast-early", id: sessionId });
  }

  function awardBadge(state, badgeId, bonus) {
    const amount = bonus || 50;
    return award(state, amount, "Badge unlocked", { type: "badge", id: badgeId });
  }

  return {
    VALUES,
    XP_PER_LEVEL,
    award,
    levelInfo,
    awardDailyActivity,
    awardWeeklyGoal,
    awardMonthlyGoal,
    awardYearlyGoal,
    awardFastingCompleted,
    awardFastingEndedEarly,
    awardBadge
  };
})();