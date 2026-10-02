/* =========================================================
   achievements.js — generic badge / achievement system (Phase 4).
   Categories: GENERAL, ACTIVITY, CONSISTENCY, FASTING
   All logic is generic; nothing is hard-coded to a specific
   activity name or icon.
   ========================================================= */

const Achievements = (() => {

  /* =========================================================
     Badge definitions
     Each badge has:
       id, category, icon, name, description
       xp           — bonus XP on unlock
       progress(state)  — returns { current, target } (numbers)
       unlocked(state)  — returns true when condition met
     ========================================================= */
  const BADGES = [

    /* ---------------- GENERAL ---------------- */
    {
      id: "first-step",
      category: "GENERAL",
      icon: "🌱",
      name: "First Step",
      description: "Complete your first activity.",
      xp: 40,
      progress(state) {
        const completed = countCompletedActivities(state);
        return { current: Math.min(completed, 1), target: 1 };
      },
      unlocked(state) {
        return countCompletedActivities(state) >= 1;
      }
    },
    {
      id: "seven-day-streak",
      category: "GENERAL",
      icon: "🔥",
      name: "7 Day Streak",
      description: "Complete all scheduled goals for 7 consecutive days.",
      xp: 100,
      progress(state) {
        const best = Math.max(state.streak.current, state.streak.best);
        return { current: Math.min(best, 7), target: 7 };
      },
      unlocked(state) {
        return Math.max(state.streak.current, state.streak.best) >= 7;
      }
    },
    {
      id: "perfect-week",
      category: "GENERAL",
      icon: "🏆",
      name: "Perfect Week",
      description: "Complete all scheduled goals for one full week.",
      xp: 200,
      progress(state) {
        const best = bestPerfectDays(state, 7);
        return { current: best, target: 7 };
      },
      unlocked(state) {
        return bestPerfectDays(state, 7) >= 7;
      }
    },
    {
      id: "level-5",
      category: "GENERAL",
      icon: "⭐",
      name: "Level 5",
      description: "Reach level 5 through consistent progress.",
      xp: 0,
      progress(state) {
        const lvl = XP.levelInfo(state.xp?.total || 0).level;
        return { current: Math.min(lvl, 5), target: 5 };
      },
      unlocked(state) {
        return XP.levelInfo(state.xp?.total || 0).level >= 5;
      }
    },

    /* ---------------- ACTIVITY ---------------- */
    {
      id: "duration-master",
      category: "ACTIVITY",
      icon: "⏱️",
      name: "Duration Master",
      description: "Accumulate 600 minutes in any duration activity.",
      xp: 120,
      progress(state) {
        const best = bestDurationActivityProgress(state, 600);
        return { current: best, target: 600 };
      },
      unlocked(state) {
        return bestDurationActivityProgress(state, 600) >= 600;
      }
    },
    {
      id: "goal-crusher",
      category: "ACTIVITY",
      icon: "🎯",
      name: "Goal Crusher",
      description: "Complete any weekly goal.",
      xp: 80,
      progress(state) {
        const any = anyCompletedPeriodGoal(state, "week") ? 1 : 0;
        return { current: any, target: 1 };
      },
      unlocked(state) {
        return anyCompletedPeriodGoal(state, "week");
      }
    },
    {
      id: "monthly-master",
      category: "ACTIVITY",
      icon: "📅",
      name: "Monthly Master",
      description: "Complete a monthly target.",
      xp: 150,
      progress(state) {
        const any = anyCompletedPeriodGoal(state, "month") ? 1 : 0;
        return { current: any, target: 1 };
      },
      unlocked(state) {
        return anyCompletedPeriodGoal(state, "month");
      }
    },
    {
      id: "century-club",
      category: "ACTIVITY",
      icon: "💯",
      name: "Century Club",
      description: "Log 100 total activity completions.",
      xp: 200,
      progress(state) {
        const n = countCompletedActivities(state);
        return { current: Math.min(n, 100), target: 100 };
      },
      unlocked(state) {
        return countCompletedActivities(state) >= 100;
      }
    },

    /* ---------------- CONSISTENCY ---------------- */
    {
      id: "consistency-7",
      category: "CONSISTENCY",
      icon: "📚",
      name: "Consistency",
      description: "Complete the same scheduled activity 7 times.",
      xp: 100,
      progress(state) {
        const max = longestActivityStreak(state);
        return { current: Math.min(max, 7), target: 7 };
      },
      unlocked(state) {
        return longestActivityStreak(state) >= 7;
      }
    },
    {
      id: "consistency-30",
      category: "CONSISTENCY",
      icon: "🗓️",
      name: "Monthly Commitment",
      description: "Complete the same activity 30 times.",
      xp: 250,
      progress(state) {
        const max = longestActivityStreak(state);
        return { current: Math.min(max, 30), target: 30 };
      },
      unlocked(state) {
        return longestActivityStreak(state) >= 30;
      }
    },
    {
      id: "perfect-month",
      category: "CONSISTENCY",
      icon: "🌟",
      name: "Perfect Month",
      description: "Have 30 total completed days.",
      xp: 300,
      progress(state) {
        const n = countPerfectDays(state);
        return { current: Math.min(n, 30), target: 30 };
      },
      unlocked(state) {
        return countPerfectDays(state) >= 30;
      }
    },

    /* ---------------- FASTING ---------------- */
    {
      id: "first-fast",
      category: "FASTING",
      icon: "⏳",
      name: "First Fast",
      description: "Complete your first fasting session.",
      xp: 50,
      progress(state) {
        const n = countCompletedFasts(state);
        return { current: Math.min(n, 1), target: 1 };
      },
      unlocked(state) {
        return countCompletedFasts(state) >= 1;
      }
    },
    {
      id: "fast-16",
      category: "FASTING",
      icon: "⚡",
      name: "16 Hour Fast",
      description: "Complete a 16-hour fasting target.",
      xp: 100,
      progress(state) {
        const best = longestCompletedFast(state);
        return { current: Math.min(best, 16), target: 16 };
      },
      unlocked(state) {
        return longestCompletedFast(state) >= 16;
      }
    },
    {
      id: "fast-18",
      category: "FASTING",
      icon: "🔥",
      name: "18 Hour Fast",
      description: "Complete an 18-hour fasting target.",
      xp: 130,
      progress(state) {
        const best = longestCompletedFast(state);
        return { current: Math.min(best, 18), target: 18 };
      },
      unlocked(state) {
        return longestCompletedFast(state) >= 18;
      }
    },
    {
      id: "fast-10",
      category: "FASTING",
      icon: "🏅",
      name: "10 Fasts",
      description: "Complete 10 fasting sessions.",
      xp: 180,
      progress(state) {
        const n = countCompletedFasts(state);
        return { current: Math.min(n, 10), target: 10 };
      },
      unlocked(state) {
        return countCompletedFasts(state) >= 10;
      }
    }
  ];

  /* =========================================================
     Evaluators (used by badge definitions above)
     ========================================================= */

  /* Count completions across all day-period activities in dailyLog. */
  function countCompletedActivities(state) {
    let count = 0;
    for (const dateKey of Object.keys(state.dailyLog || {})) {
      const day = state.dailyLog[dateKey];
      for (const activityId of Object.keys(day)) {
        const value = day[activityId];
        const snap  = Storage.getActivitySnapshot(state, activityId, dateKey);
        const target = snap ? snap.targetValue : (
          state.activities.find(a => a.id === activityId)?.targetValue || 1
        );
        if (value >= target) count++;
      }
    }
    return count;
  }

  function bestDurationActivityProgress(state, cap) {
    /* Sum total progress across dailyLog per activity, for duration-type activities. */
    const totals = {};
    for (const dateKey of Object.keys(state.dailyLog || {})) {
      const day = state.dailyLog[dateKey];
      for (const activityId of Object.keys(day)) {
        const activity = state.activities.find(a => a.id === activityId);
        const snap = Storage.getActivitySnapshot(state, activityId, dateKey);
        const type = snap?.trackingType || activity?.trackingType;
        if (type !== "duration") continue;
        totals[activityId] = (totals[activityId] || 0) + (day[activityId] || 0);
      }
    }
    return Math.min(cap, Math.max(0, ...Object.values(totals), 0));
  }

  function anyCompletedPeriodGoal(state, period) {
    for (const activity of state.activities || []) {
      if (activity.targetPeriod !== period) continue;
      const key = Storage.periodKeyForDate(period, new Date());
      const value = (state.progress[key] || {})[activity.id] || 0;
      if (value >= activity.targetValue) return true;
    }
    return false;
  }

  /* Longest run of consecutive days where the same activity was completed. */
  function longestActivityStreak(state) {
    const perActivity = {};
    for (const dateKey of Object.keys(state.dailyLog || {}).sort()) {
      const day = state.dailyLog[dateKey];
      for (const activityId of Object.keys(day)) {
        const value = day[activityId];
        const snap  = Storage.getActivitySnapshot(state, activityId, dateKey);
        const target = snap ? snap.targetValue : (
          state.activities.find(a => a.id === activityId)?.targetValue || 1
        );
        if (value >= target) {
          perActivity[activityId] = (perActivity[activityId] || 0) + 1;
        }
      }
    }
    return Math.max(0, ...Object.values(perActivity), 0);
  }

  function countPerfectDays(state) {
    let count = 0;
    for (const dateKey of Object.keys(state.dailyLog || {})) {
      if (isPerfectDay(state, dateKey)) count++;
    }
    return count;
  }

  function isPerfectDay(state, dateKey) {
    const day = state.dailyLog[dateKey];
    if (!day) return false;
    const activities = Object.keys(day);
    if (!activities.length) return false;
    let anyDone = false;
    for (const activityId of activities) {
      const value = day[activityId];
      const snap = Storage.getActivitySnapshot(state, activityId, dateKey);
      const target = snap ? snap.targetValue : (
        state.activities.find(a => a.id === activityId)?.targetValue || 1
      );
      if (value >= target) anyDone = true;
      else return false;
    }
    return anyDone;
  }

  function bestPerfectDays(state, cap) {
    const dates = Object.keys(state.dailyLog || {}).sort();
    let best = 0, run = 0, prev = null;
    for (const d of dates) {
      if (!isPerfectDay(state, d)) { run = 0; prev = d; continue; }
      if (prev && isNextDay(prev, d)) run++;
      else run = 1;
      best = Math.max(best, run);
      prev = d;
    }
    return Math.min(cap, best);
  }

  function isNextDay(prevKey, key) {
    const [y1,m1,d1] = prevKey.split("-").map(Number);
    const [y2,m2,d2] = key.split("-").map(Number);
    const a = new Date(y1, m1-1, d1);
    const b = new Date(y2, m2-1, d2);
    return (b - a) === 86400000;
  }

  function countCompletedFasts(state) {
    return (state.fasting?.sessions || []).filter(s => s.completed).length;
  }

  function longestCompletedFast(state) {
    const list = (state.fasting?.sessions || []).filter(s => s.completed);
    return Math.max(0, ...list.map(s => s.actualHours || 0), 0);
  }

  /* =========================================================
     Public API — check + evaluate
     ========================================================= */

  /**
   * checkAll(state) — evaluate every badge; unlock new ones.
   * Returns array of newly unlocked badges.
   */
  function checkAll(state) {
    state.achievements = state.achievements || {};
    const unlockedNow = [];

    for (const badge of BADGES) {
      if (state.achievements[badge.id]) continue;
      try {
        if (badge.unlocked(state)) {
          state.achievements[badge.id] = {
            unlockedAt: Date.now(),
            xp: badge.xp || 0
          };
          unlockedNow.push(badge);

          if (badge.xp) XP.awardBadge(state, badge.id, badge.xp);
        }
      } catch (e) {
        console.error("[achievements] check failed for", badge.id, e);
      }
    }

    if (unlockedNow.length) Storage.saveState(state);
    return unlockedNow;
  }

  /**
   * status(state, badgeId) — { current, target, percent, unlocked, unlockedAt }
   */
  function status(state, badgeId) {
    const badge = BADGES.find(b => b.id === badgeId);
    if (!badge) return null;
    const unlockedRec = state.achievements?.[badgeId] || null;
    let prog = { current: 0, target: 1 };
    try { prog = badge.progress(state) || prog; } catch (e) {}
    const percent = Math.min(100, Math.round((prog.current / Math.max(1, prog.target)) * 100));
    return {
      badge,
      current: prog.current,
      target: prog.target,
      percent,
      unlocked: !!unlockedRec,
      unlockedAt: unlockedRec?.unlockedAt || null
    };
  }

  function byCategory(cat) {
    return BADGES.filter(b => b.category === cat);
  }

  function all() { return BADGES.slice(); }

  /* =========================================================
     Popup
     ========================================================= */
  function showUnlockPopup(badge) {
    const host = document.getElementById("achievement-host");
    if (!host) return;
    host.innerHTML = "";

    const backdrop = document.createElement("div");
    backdrop.className = "achv-backdrop";
    backdrop.innerHTML = `
      <div class="achv-card">
        <div class="achv-badge">🏆</div>
        <div class="achv-tag">Achievement Unlocked</div>
        <div class="achv-title">${badge.icon} ${escapeHtml(badge.name)}</div>
        <div class="achv-name">${escapeHtml(badge.description)}</div>
        ${badge.xp ? `<div class="achv-xp">+${badge.xp} XP</div>` : ""}
        <button class="btn btn-primary" data-close>Continue</button>
      </div>
    `;
    host.appendChild(backdrop);

    const close = () => { host.innerHTML = ""; };
    backdrop.querySelector("[data-close]").addEventListener("click", close);
    backdrop.addEventListener("click", e => { if (e.target === backdrop) close(); });
  }

  function escapeHtml(str = "") {
    return String(str).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  return {
    BADGES,
    checkAll,
    status,
    byCategory,
    all,
    showUnlockPopup
  };
})();