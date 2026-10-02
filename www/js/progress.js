/* =========================================================
   progress.js — Phase 4.1 (patched)
   Tile dashboard with expandable sections.
   FIX: header always shows title + summary, collapsed or not.
   ========================================================= */

const Progress = (() => {

  let currentPeriod = "week";
  let els = {};

  const openSections = new Set(["activity"]);
  let badgeCategory = "GENERAL";

  /* =========================================================
     Init
     ========================================================= */
  function init(rootEls) {
    els = rootEls;

    document.querySelectorAll(".period-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        if (btn.dataset.period === currentPeriod) return;
        currentPeriod = btn.dataset.period;
        document.querySelectorAll(".period-btn").forEach(b =>
          b.classList.toggle("active", b === btn));
        render();
      });
    });

    render();
  }

  function refresh() { render(); }

  /* =========================================================
     Range helpers
     ========================================================= */
  function getRange(period, base = new Date()) {
    if (period === "week") {
      const d = new Date(base);
      const day = (d.getDay() + 6) % 7;
      const monday = new Date(d);
      monday.setDate(d.getDate() - day);
      monday.setHours(0, 0, 0, 0);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);
      return { from: monday, to: sunday, label: "This Week" };
    }
    if (period === "month") {
      const from = new Date(base.getFullYear(), base.getMonth(), 1, 0, 0, 0, 0);
      const to   = new Date(base.getFullYear(), base.getMonth() + 1, 0, 23, 59, 59, 999);
      return { from, to, label: "This Month" };
    }
    const from = new Date(base.getFullYear(), 0, 1, 0, 0, 0, 0);
    const to   = new Date(base.getFullYear(), 11, 31, 23, 59, 59, 999);
    return { from, to, label: "This Year" };
  }

  function getPreviousRange(period, base = new Date()) {
    if (period === "week") {
      const d = new Date(base);
      d.setDate(d.getDate() - 7);
      return getRange("week", d);
    }
    if (period === "month") {
      const d = new Date(base.getFullYear(), base.getMonth() - 1, 15);
      return getRange("month", d);
    }
    const d = new Date(base.getFullYear() - 1, 6, 1);
    return getRange("year", d);
  }

  /* =========================================================
     Metrics
     ========================================================= */
  function computeActivityMetrics(state, range) {
    let doneCount = 0, scheduledCount = 0, totalTimeMinutes = 0;
    const perActivity = {};

    const cursor = new Date(range.from);
    cursor.setHours(0, 0, 0, 0);
    const end = new Date(range.to);
    end.setHours(23, 59, 59, 999);

    while (cursor <= end) {
      const key = Storage.todayKey(cursor);
      const dayLog = state.dailyLog[key] || {};

      (state.activities || []).forEach(activity => {
        if (activity.targetPeriod !== "day") return;
        const snap = Storage.getActivitySnapshot(state, activity.id, key) || activity;
        const pausedBackThen = activity.paused && !dayLog[activity.id];
        if (pausedBackThen) return;

        let scheduled = true;
        if (activity.schedule === "selectedDays") {
          scheduled = (activity.days || []).includes(cursor.getDay());
        }
        if (!scheduled && !dayLog[activity.id]) return;

        const value  = dayLog[activity.id] || 0;
        const target = snap.targetValue || 1;

        scheduledCount++;
        if (value >= target) doneCount++;

        if (snap.trackingType === "duration") {
          totalTimeMinutes += convertToMinutes(value, snap.targetUnit);
        }

        const bucket = perActivity[activity.id] || {
          id: activity.id,
          name: snap.name || activity.name,
          icon: snap.icon || activity.icon,
          unit: unitLabel(snap),
          type: snap.trackingType || activity.trackingType,
          current: 0, target: 0
        };
        bucket.current += value;
        bucket.target  += target;
        perActivity[activity.id] = bucket;
      });

      cursor.setDate(cursor.getDate() + 1);
    }

    (state.activities || []).forEach(activity => {
      if (activity.targetPeriod === "day") return;
      const key = Storage.currentPeriodKey(activity);
      const value = (state.progress[key] && state.progress[key][activity.id]) || 0;
      if (!value && !activity.targetValue) return;

      const bucket = perActivity[activity.id] || {
        id: activity.id,
        name: activity.name,
        icon: activity.icon,
        unit: unitLabel(activity),
        type: activity.trackingType,
        current: 0, target: 0
      };
      bucket.current += value;
      bucket.target  += activity.targetValue;
      perActivity[activity.id] = bucket;

      scheduledCount++;
      if (value >= activity.targetValue) doneCount++;

      if (activity.trackingType === "duration") {
        totalTimeMinutes += convertToMinutes(value, activity.targetUnit);
      }
    });

    const overall = scheduledCount === 0 ? 0
                  : Math.round((doneCount / scheduledCount) * 100);

    return { overall, doneCount, scheduledCount, totalTimeMinutes, perActivity };
  }

  function computeFastingMetrics(state, range) {
    const sessions = (state.fasting.sessions || []).filter(s =>
      s.endTs >= range.from.getTime() && s.endTs <= range.to.getTime()
    );
    const completed = sessions.filter(s => s.completed).length;
    const total = sessions.length;
    const avgHours = total
      ? sessions.reduce((a, s) => a + (s.actualHours || 0), 0) / total : 0;
    const longest = sessions.reduce((a, s) => Math.max(a, s.actualHours || 0), 0);
    const successRate = total ? Math.round((completed / total) * 100) : 0;
    return { sessions, completed, total, avgHours, longest, successRate };
  }

  function computeTodoMetrics(state, range) {
    const fromKey  = Storage.todayKey(range.from);
    const toKey    = Storage.todayKey(range.to);
    const todayKey = Storage.todayKey();

    const inRange   = (state.todos || []).filter(t => t.date >= fromKey && t.date <= toKey);
    const completed = inRange.filter(t => t.completed).length;
    const total     = inRange.length;
    const pending   = total - completed;
    const overdue   = (state.todos || []).filter(t => !t.completed && t.date < todayKey).length;

    return { completed, total, pending, overdue };
  }

  function computeBadges(state, range) {
    const unlocked = Object.entries(state.achievements || {})
      .filter(([_, v]) => v.unlockedAt >= range.from.getTime() && v.unlockedAt <= range.to.getTime());
    return unlocked.length;
  }

  function computeXpEarned(state, range) {
    return (state.xp?.log || [])
      .filter(e => e.ts >= range.from.getTime() && e.ts <= range.to.getTime())
      .reduce((a, e) => a + (e.amount || 0), 0);
  }

  /* =========================================================
     Helpers
     ========================================================= */
  function unitLabel(activity) {
    if (activity.targetUnit === "custom") return activity.customUnit || "units";
    return activity.targetUnit;
  }
  function convertToMinutes(value, unit) {
    if (unit === "minutes") return value;
    if (unit === "hours")   return value * 60;
    return 0;
  }
  function formatTime(totalMinutes) {
    const total = Math.round(totalMinutes);
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (h && m) return `${h}h ${m}m`;
    if (h)      return `${h}h`;
    return `${m}m`;
  }
  function formatHours(h) {
    const hh = Math.floor(h);
    const mm = Math.round((h - hh) * 60);
    if (hh && mm) return `${hh}h ${mm}m`;
    if (hh)       return `${hh}h`;
    return `${mm}m`;
  }
  function escapeHtml(str = "") {
    return String(str).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }
  function isOpen(id) { return openSections.has(id); }
  function toggle(id) {
    if (openSections.has(id)) openSections.delete(id);
    else                       openSections.add(id);
    render();
  }

  /* =========================================================
     Section wrapper — KEY FIX
     The header always shows icon + title + summary + chevron.
     The body is hidden via CSS `.open` class only.
     ========================================================= */
  function section({ id, icon, title, summary, body }) {
    const open = isOpen(id);
    return `
      <div class="prog-section ${open ? "open" : ""}">
        <button class="prog-section-header" data-toggle-section="${id}">
          <div class="prog-section-icon">${icon}</div>
          <div class="prog-section-titles">
            <div class="prog-section-title">${title}</div>
            <div class="prog-section-summary">${summary}</div>
          </div>
          <div class="prog-section-chevron">▼</div>
        </button>
        <div class="prog-section-body">
          <div class="prog-section-inner">
            ${body}
          </div>
        </div>
      </div>
    `;
  }

  /* =========================================================
     Main render
     ========================================================= */
  function render() {
    const state = Storage.loadState();
    const range = getRange(currentPeriod);
    const prevRange = getPreviousRange(currentPeriod);

    const metrics     = computeActivityMetrics(state, range);
    const prevMetrics = computeActivityMetrics(state, prevRange);
    const fasting     = computeFastingMetrics(state, range);
    const prevFasting = computeFastingMetrics(state, prevRange);
    const todos       = computeTodoMetrics(state, range);
    const streaks     = {
      current: state.streak.current || 0,
      best:    state.streak.best || 0
    };
    const badgesEarned = computeBadges(state, range);
    const xpEarned     = computeXpEarned(state, range);

    const overallDelta = metrics.overall - prevMetrics.overall;
    const timeDelta    = metrics.totalTimeMinutes - prevMetrics.totalTimeMinutes;
    const fastDelta    = fasting.avgHours - prevFasting.avgHours;

    els.body.innerHTML = `
      ${renderHero(range, metrics, streaks, overallDelta, timeDelta)}
      ${renderTileGrid(metrics, streaks, fasting, todos)}
      <div class="prog-sections">
        ${renderActivitySection(state, metrics)}
        ${renderFastingSection(state, fasting, fastDelta)}
        ${renderAchievementsSection(state)}
        ${renderXpSection(state, xpEarned)}
        ${renderWeeklySection(range, metrics, fasting, streaks, badgesEarned, xpEarned, todos, overallDelta, timeDelta, fastDelta)}
        ${renderTodoSection(state, todos)}
      </div>
    `;

    /* Wire toggles */
    els.body.querySelectorAll("[data-toggle-section]").forEach(header => {
      header.addEventListener("click", () => toggle(header.dataset.toggleSection));
    });

    /* Draw chart if activity section is open */
    requestAnimationFrame(() => {
      if (isOpen("activity")) drawTrendChart(state, range);
      if (isOpen("achievements")) renderBadgeGrid(state);
    });
  }

  /* =========================================================
     Hero
     ========================================================= */
  function renderHero(range, metrics, streaks, overallDelta, timeDelta) {
    const arrow = overallDelta > 0 ? "↑" : overallDelta < 0 ? "↓" : "—";
    const deltaCls = overallDelta > 0 ? "up" : overallDelta < 0 ? "down" : "neutral";
    const xpInfo = XP.levelInfo(Storage.loadState().xp?.total || 0);

    return `
      <div class="prog-hero-card">
        <div class="prog-hero-top">
          <div class="prog-hero-main">
            <div class="prog-hero-big">${metrics.overall}%</div>
            <div class="prog-hero-cap">Overall Progress · ${range.label}</div>
          </div>
          <div class="prog-hero-streak">🔥 ${streaks.current} Days</div>
        </div>
        <div class="prog-hero-level">
          <div class="prog-hero-level-top">
            <strong>Level ${xpInfo.level}</strong>
            <span>${xpInfo.intoLevel} / ${xpInfo.perLevel} XP</span>
          </div>
          <div class="xp-bar"><div class="xp-bar-fill" style="width:${xpInfo.percent}%"></div></div>
        </div>
        <div class="prog-hero-deltas">
          <span class="delta-chip ${deltaCls}">
            ${arrow} ${Math.abs(overallDelta)}% vs last ${currentPeriod}
          </span>
          <span class="delta-chip ${timeDelta > 0 ? "up" : timeDelta < 0 ? "down" : "neutral"}">
            ${timeDelta > 0 ? "↑" : timeDelta < 0 ? "↓" : "—"} ${formatTime(Math.abs(timeDelta))} activity
          </span>
        </div>
      </div>
    `;
  }

  /* =========================================================
     Tile grid
     ========================================================= */
  function renderTileGrid(metrics, streaks, fasting, todos) {
    const goalText = `${metrics.doneCount}/${metrics.scheduledCount}`;
    const fastText = `${fasting.completed}/${fasting.total}`;
    const fastPct  = fasting.total ? Math.round((fasting.completed / fasting.total) * 100) : 0;
    const timeText = formatTime(metrics.totalTimeMinutes);

    return `
      <div class="prog-tiles">
        <div class="prog-tile">
          <div class="prog-tile-icon">🎯</div>
          <div class="prog-tile-value">${metrics.overall}%</div>
          <div class="prog-tile-label">Overall</div>
          <div class="prog-tile-sub">${goalText} goals</div>
        </div>
        <div class="prog-tile">
          <div class="prog-tile-icon">🔥</div>
          <div class="prog-tile-value">${streaks.current}d</div>
          <div class="prog-tile-label">Streak</div>
          <div class="prog-tile-sub">Best ${streaks.best} days</div>
        </div>
        <div class="prog-tile">
          <div class="prog-tile-icon">⏳</div>
          <div class="prog-tile-value">${fasting.total ? fastPct + "%" : "—"}</div>
          <div class="prog-tile-label">Fasting</div>
          <div class="prog-tile-sub">${fasting.total ? fastText : "No sessions"}</div>
        </div>
        <div class="prog-tile">
          <div class="prog-tile-icon">⏱️</div>
          <div class="prog-tile-value">${metrics.totalTimeMinutes ? timeText : "—"}</div>
          <div class="prog-tile-label">Activity Time</div>
          <div class="prog-tile-sub">${metrics.totalTimeMinutes ? "this period" : "no duration yet"}</div>
        </div>
      </div>
    `;
  }

  /* =========================================================
     Sections
     ========================================================= */
  function renderActivitySection(state, metrics) {
    const activities = Object.values(metrics.perActivity);

    const emptyBlock = `
      <div class="prog-empty">
        <strong>No activity progress yet.</strong>
        Complete an activity to start building your weekly trend.
      </div>
    `;

    const listHTML = activities.length ? activities.map(a => {
      const percent = a.target > 0
        ? Math.min(100, Math.round((a.current / a.target) * 100)) : 0;
      const cls = percent < 50 ? "low" : "";
      return `
        <div class="prog-act-row">
          <div class="prog-act-top">
            <div class="prog-act-icon">${escapeHtml(a.icon || "⭐")}</div>
            <div class="prog-act-meta">
              <div class="prog-act-name">${escapeHtml(a.name)}</div>
              <div class="prog-act-val">${a.current} / ${a.target} ${escapeHtml(a.unit)}</div>
            </div>
            <div class="prog-act-pct ${cls}">${percent}%</div>
          </div>
          <div class="bar"><div class="bar-fill" style="width:${percent}%"></div></div>
        </div>
      `;
    }).join("") : emptyBlock;

    const summary = `${metrics.overall}% · ${metrics.doneCount} / ${metrics.scheduledCount} goals`;

    const body = `
      ${activities.length ? `
        <div class="prog-trend">
          <div class="trend-svg-holder">
            <svg class="trend-svg" data-trend-svg></svg>
            <div class="trend-tooltip" data-trend-tooltip></div>
          </div>
        </div>
      ` : ""}
      ${listHTML}
    `;

    return section({
      id: "activity",
      icon: "📊",
      title: "Activity Progress",
      summary,
      body
    });
  }

  function renderFastingSection(state, fasting, avgDelta) {
    if (fasting.total === 0) {
      return section({
        id: "fasting",
        icon: "⏳",
        title: "Fasting",
        summary: "No completed fasts this period",
        body: `
          <div class="prog-empty">
            <strong>No completed fasts this period.</strong>
            Start a fast to begin tracking your trend.
          </div>
        `
      });
    }

    const avgStr     = formatHours(fasting.avgHours);
    const longestStr = formatHours(fasting.longest);
    const arrow      = avgDelta > 0 ? "↑" : avgDelta < 0 ? "↓" : "—";
    const deltaStr   = formatHours(Math.abs(avgDelta));

    const summary = `${fasting.completed} / ${fasting.total} completed · Avg ${avgStr}`;

    const body = `
      <div class="fast-summary-grid">
        <div class="fast-summary-tile">
          <div class="fast-summary-label">Completed</div>
          <div class="fast-summary-value">${fasting.completed} / ${fasting.total}</div>
        </div>
        <div class="fast-summary-tile">
          <div class="fast-summary-label">Target Success</div>
          <div class="fast-summary-value">${fasting.successRate}%</div>
        </div>
        <div class="fast-summary-tile">
          <div class="fast-summary-label">Average Fast</div>
          <div class="fast-summary-value">${avgStr}</div>
          <div class="prog-tile-sub">${arrow} ${deltaStr} vs last</div>
        </div>
        <div class="fast-summary-tile">
          <div class="fast-summary-label">Longest Fast</div>
          <div class="fast-summary-value">${longestStr}</div>
          <div class="prog-tile-sub">informational only</div>
        </div>
      </div>
    `;

    return section({
      id: "fasting",
      icon: "⏳",
      title: "Fasting",
      summary,
      body
    });
  }

  function renderAchievementsSection(state) {
    const all = Achievements.all();
    const unlocked = all.filter(b => state.achievements?.[b.id]);
    const total = all.length;
    const unlockedCount = unlocked.length;

    const latest = unlocked
      .map(b => ({ badge: b, at: state.achievements[b.id].unlockedAt }))
      .sort((a, b) => b.at - a.at)[0];

    const summary = unlockedCount === 0
      ? "Your first achievements will appear here"
      : `${unlockedCount} / ${total} unlocked · Latest: ${latest.badge.icon} ${latest.badge.name}`;

    const cats = ["GENERAL", "ACTIVITY", "CONSISTENCY", "FASTING"];
    const catRow = cats.map(c =>
      `<button class="badge-cat-chip ${c === badgeCategory ? "active" : ""}" data-cat="${c}">${c}</button>`
    ).join("");

    const body = `
      ${unlockedCount === 0 ? `
        <div class="prog-empty">
          <strong>🌱 Your first achievements will appear here.</strong>
          Complete activities and fasts to start unlocking.
        </div>
      ` : ""}
      <div class="badge-cat-row" data-badge-cats>${catRow}</div>
      <div class="badge-grid" data-badge-grid></div>
    `;

    return section({
      id: "achievements",
      icon: "🏆",
      title: "Achievements",
      summary,
      body
    });
  }

  function renderXpSection(state, xpEarned) {
    const info = XP.levelInfo(state.xp?.total || 0);

    const recent = (state.xp?.log || [])
      .slice()
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 6);

    const summary = `Level ${info.level} · ${info.totalXp} XP · ${info.toNext} to next`;

    const body = `
      <div class="xp-card-compact">
        <div class="prog-hero-level-top">
          <strong>Level ${info.level}</strong>
          <span>${info.intoLevel} / ${info.perLevel} XP</span>
        </div>
        <div class="xp-bar"><div class="xp-bar-fill" style="width:${info.percent}%"></div></div>
        <div class="prog-hero-level-top">
          <span>Total</span>
          <strong>${info.totalXp} XP</strong>
        </div>
        <div class="prog-hero-level-top">
          <span>Earned this ${currentPeriod}</span>
          <strong>+${xpEarned} XP</strong>
        </div>
      </div>
      ${recent.length ? `
        <div class="xp-history">
          ${recent.map(e => `
            <div class="xp-history-row">
              <span class="xp-history-reason">${escapeHtml(e.reason || "XP")}</span>
              <span class="xp-history-amount">+${e.amount}</span>
            </div>
          `).join("")}
        </div>
      ` : `
        <div class="prog-empty">No XP earned yet.</div>
      `}
    `;

    return section({
      id: "xp",
      icon: "⭐",
      title: "XP & Level",
      summary,
      body
    });
  }

  function renderWeeklySection(range, metrics, fasting, streaks, badgesEarned, xpEarned, todos, overallDelta, timeDelta, fastDelta) {
    const label = currentPeriod === "week"
      ? `Summary · ${range.from.getDate()}–${range.to.getDate()} ${range.to.toLocaleDateString(undefined,{month:"short"})}`
      : currentPeriod === "month"
        ? `Summary · ${range.from.toLocaleDateString(undefined,{month:"long"})}`
        : `Summary · ${range.from.getFullYear()}`;

    const oArrow = overallDelta > 0 ? "↑" : overallDelta < 0 ? "↓" : "—";
    const oCls   = overallDelta > 0 ? "up" : overallDelta < 0 ? "down" : "neutral";
    const tArrow = timeDelta > 0 ? "↑" : timeDelta < 0 ? "↓" : "—";
    const tCls   = timeDelta > 0 ? "up" : timeDelta < 0 ? "down" : "neutral";
    const fArrow = fastDelta > 0 ? "↑" : fastDelta < 0 ? "↓" : "—";

    const summary = `${metrics.overall}% · ${oArrow} ${Math.abs(overallDelta)}% vs last`;

    const body = `
      <div class="summary-list">
        <div class="summary-row">
          <span class="summary-row-label">Overall Completion</span>
          <span class="summary-row-value">${metrics.overall}%
            <span class="summary-row-delta ${oCls}">${oArrow} ${Math.abs(overallDelta)}%</span>
          </span>
        </div>
        <div class="summary-row">
          <span class="summary-row-label">Activities Completed</span>
          <span class="summary-row-value">${metrics.doneCount} / ${metrics.scheduledCount}</span>
        </div>
        <div class="summary-row">
          <span class="summary-row-label">Activity Time</span>
          <span class="summary-row-value">${formatTime(metrics.totalTimeMinutes)}
            <span class="summary-row-delta ${tCls}">${tArrow} ${formatTime(Math.abs(timeDelta))}</span>
          </span>
        </div>
        <div class="summary-row">
          <span class="summary-row-label">Fasting Sessions</span>
          <span class="summary-row-value">${fasting.completed} / ${fasting.total}</span>
        </div>
        <div class="summary-row">
          <span class="summary-row-label">Average Fasting</span>
          <span class="summary-row-value">${formatHours(fasting.avgHours)}
            <span class="summary-row-delta neutral">${fArrow} ${formatHours(Math.abs(fastDelta))}</span>
          </span>
        </div>
        <div class="summary-row">
          <span class="summary-row-label">To-Dos Completed</span>
          <span class="summary-row-value">${todos.completed} / ${todos.total}</span>
        </div>
        <div class="summary-row">
          <span class="summary-row-label">Badges Earned</span>
          <span class="summary-row-value">${badgesEarned}</span>
        </div>
        <div class="summary-row">
          <span class="summary-row-label">XP Earned</span>
          <span class="summary-row-value">${xpEarned} XP</span>
        </div>
      </div>
    `;

    return section({
      id: "summary",
      icon: "📅",
      title: label,
      summary,
      body
    });
  }

  function renderTodoSection(state, todos) {
    const pct = todos.total ? Math.round((todos.completed / todos.total) * 100) : 0;

    const summary = todos.total
      ? `${todos.completed} / ${todos.total} completed · ${pct}%`
      : "No tasks in this period";

    const body = (todos.total === 0 && todos.overdue === 0)
      ? `<div class="prog-empty">No tasks in this period.</div>`
      : `
        <div class="todo-stats-row">
          <div class="todo-stat ok">
            <div class="todo-stat-value">${todos.completed}</div>
            <div class="todo-stat-label">Completed</div>
          </div>
          <div class="todo-stat warn">
            <div class="todo-stat-value">${todos.pending}</div>
            <div class="todo-stat-label">Pending</div>
          </div>
          <div class="todo-stat ${todos.overdue ? "danger" : ""}">
            <div class="todo-stat-value">${todos.overdue}</div>
            <div class="todo-stat-label">Overdue</div>
          </div>
        </div>
      `;

    return section({
      id: "todo",
      icon: "✅",
      title: "To-Do Progress",
      summary,
      body
    });
  }

  /* =========================================================
     Trend chart
     ========================================================= */
  function buildTrendBuckets(state, range, period) {
    const buckets = [];

    if (period === "week") {
      const cursor = new Date(range.from);
      for (let i = 0; i < 7; i++) {
        const day = new Date(cursor);
        const key = Storage.todayKey(day);
        const b = {
          label: day.toLocaleDateString(undefined,{weekday:"short"}).toUpperCase(),
          key, date: day, percent: 0, done: 0, total: 0, details: []
        };
        (state.activities || []).forEach(activity => {
          if (activity.targetPeriod !== "day") return;
          const snap = Storage.getActivitySnapshot(state, activity.id, key) || activity;
          const scheduled = (activity.schedule === "everyday") ||
                            (activity.days || []).includes(day.getDay());
          if (!scheduled) return;
          const value = (state.dailyLog[key] || {})[activity.id] || 0;
          const target = snap.targetValue || 1;
          b.total++;
          if (value >= target) b.done++;
          b.details.push({
            name: snap.name || activity.name,
            icon: snap.icon || activity.icon,
            value, target, unit: unitLabel(snap)
          });
        });
        b.percent = b.total ? Math.round((b.done / b.total) * 100) : 0;
        buckets.push(b);
        cursor.setDate(cursor.getDate() + 1);
      }
      return buckets;
    }

    if (period === "month") {
      const cursor = new Date(range.from);
      while (cursor <= range.to && buckets.length < 6) {
        const monday = new Date(cursor);
        const day = (monday.getDay() + 6) % 7;
        monday.setDate(monday.getDate() - day);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);

        const b = {
          label: `W${buckets.length + 1}`,
          key: Storage.todayKey(monday),
          date: new Date(monday),
          percent: 0, done: 0, total: 0, details: []
        };

        const c2 = new Date(monday);
        while (c2 <= sunday && c2 <= range.to) {
          if (c2 >= range.from) {
            const key = Storage.todayKey(c2);
            (state.activities || []).forEach(activity => {
              if (activity.targetPeriod !== "day") return;
              const snap = Storage.getActivitySnapshot(state, activity.id, key) || activity;
              const scheduled = (activity.schedule === "everyday") ||
                                (activity.days || []).includes(c2.getDay());
              if (!scheduled) return;
              const value = (state.dailyLog[key] || {})[activity.id] || 0;
              const target = snap.targetValue || 1;
              b.total++;
              if (value >= target) b.done++;
            });
          }
          c2.setDate(c2.getDate() + 1);
        }
        b.percent = b.total ? Math.round((b.done / b.total) * 100) : 0;
        buckets.push(b);
        cursor.setDate(cursor.getDate() + 7);
      }
      return buckets;
    }

    for (let m = 0; m < 12; m++) {
      const monthStart = new Date(range.from.getFullYear(), m, 1);
      const monthEnd   = new Date(range.from.getFullYear(), m + 1, 0);
      const b = {
        label: monthStart.toLocaleDateString(undefined,{month:"short"}).toUpperCase(),
        key: `${range.from.getFullYear()}-${String(m+1).padStart(2,"0")}`,
        date: monthStart, percent: 0, done: 0, total: 0, details: []
      };

      const c = new Date(monthStart);
      while (c <= monthEnd) {
        const key = Storage.todayKey(c);
        (state.activities || []).forEach(activity => {
          if (activity.targetPeriod !== "day") return;
          const snap = Storage.getActivitySnapshot(state, activity.id, key) || activity;
          const scheduled = (activity.schedule === "everyday") ||
                            (activity.days || []).includes(c.getDay());
          if (!scheduled) return;
          const value = (state.dailyLog[key] || {})[activity.id] || 0;
          const target = snap.targetValue || 1;
          b.total++;
          if (value >= target) b.done++;
        });
        c.setDate(c.getDate() + 1);
      }
      b.percent = b.total ? Math.round((b.done / b.total) * 100) : 0;
      buckets.push(b);
    }
    return buckets;
  }

  function drawTrendChart(state, range) {
    const svg = els.body.querySelector("[data-trend-svg]");
    const tt  = els.body.querySelector("[data-trend-tooltip]");
    if (!svg) return;

    const holder = svg.parentElement;
    const w = holder.clientWidth;
    if (!w) return;

    const buckets = buildTrendBuckets(state, range, currentPeriod);
    if (!buckets.length) return;

    const VB_W = 340, VB_H = 150;
    const PAD = { top: 12, right: 8, bottom: 26, left: 8 };
    const INNER_W = VB_W - PAD.left - PAD.right;
    const INNER_H = VB_H - PAD.top - PAD.bottom;

    const barGap = 6;
    const barWidth = Math.max(6, (INNER_W - barGap * (buckets.length - 1)) / buckets.length);
    const todayKey = Storage.todayKey();

    const barsHTML = buckets.map((b, i) => {
      const x = PAD.left + i * (barWidth + barGap);
      const isEmpty = b.total === 0;
      const h = isEmpty ? 2 : (b.percent / 100) * INNER_H;
      const y = PAD.top + INNER_H - h;
      const isToday = b.key === todayKey;
      return `
        <rect class="trend-bar ${isEmpty ? "empty" : ""} ${isToday ? "today" : ""}"
              x="${x}" y="${isEmpty ? PAD.top + INNER_H - 2 : y}"
              width="${barWidth}" height="${isEmpty ? 2 : Math.max(2, h)}"
              rx="3" data-index="${i}"/>
        ${!isEmpty ? `<text class="trend-value-label"
              x="${x + barWidth/2}" y="${y - 3}"
              text-anchor="middle">${b.percent}%</text>` : ""}
        <text class="trend-day-label ${isToday ? "today" : ""}"
              x="${x + barWidth/2}" y="${VB_H - 8}"
              text-anchor="middle">${b.label}</text>
      `;
    }).join("");

    svg.setAttribute("viewBox", `0 0 ${VB_W} ${VB_H}`);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.innerHTML = `
      <defs>
        <linearGradient id="trendBarGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stop-color="#4dd4ac"/>
          <stop offset="100%" stop-color="#6e8bff"/>
        </linearGradient>
      </defs>
      <line class="trend-baseline"
            x1="${PAD.left}" y1="${PAD.top + INNER_H}"
            x2="${PAD.left + INNER_W}" y2="${PAD.top + INNER_H}"/>
      ${barsHTML}
    `;

    svg.querySelectorAll(".trend-bar").forEach(rect => {
      rect.addEventListener("click", (e) => {
        e.stopPropagation();
        const i = Number(rect.dataset.index);
        const b = buckets[i];
        if (!b || !tt) return;

        tt.innerHTML = `
          <span class="tt-title">${b.label}</span>
          <div class="tt-row"><span>Completed</span><strong>${b.done} / ${b.total}</strong></div>
          <div class="tt-row"><span>Rate</span><strong>${b.percent}%</strong></div>
          ${b.details && b.details.length ? b.details.slice(0,6).map(d =>
            `<div class="tt-row">
               <span>${escapeHtml(d.icon || "")} ${escapeHtml(d.name)}</span>
               <strong>${d.value} / ${d.target} ${escapeHtml(d.unit)}</strong>
             </div>`).join("") : ""}
        `;
        tt.classList.add("visible");

        const rectBox   = rect.getBoundingClientRect();
        const holderBox = holder.getBoundingClientRect();
        const left = rectBox.left - holderBox.left + rectBox.width / 2 - tt.offsetWidth / 2;
        const top  = rectBox.top  - holderBox.top  - tt.offsetHeight - 8;

        tt.style.left = Math.max(4, Math.min(left, holder.clientWidth - tt.offsetWidth - 4)) + "px";
        tt.style.top  = Math.max(4, top) + "px";
      });
    });
  }

  document.addEventListener("click", (e) => {
    const tt = document.querySelector(".trend-tooltip.visible");
    if (tt && !tt.contains(e.target) && !e.target.classList?.contains("trend-bar")) {
      tt.classList.remove("visible");
    }
  });

  /* =========================================================
     Badge grid
     ========================================================= */
  function renderBadgeGrid(state) {
    const grid = els.body.querySelector("[data-badge-grid]");
    const cats = els.body.querySelector("[data-badge-cats]");
    if (!grid) return;

    const list = Achievements.byCategory(badgeCategory);

    grid.innerHTML = list.map(b => {
      const s = Achievements.status(state, b.id);
      if (!s) return "";
      const cls = s.unlocked ? "unlocked" : "locked";
      const progressText = s.unlocked
        ? `Unlocked · ${new Date(s.unlockedAt).toLocaleDateString(undefined,{day:"numeric",month:"short"})}`
        : `${s.current} / ${s.target} · ${s.percent}%`;
      return `
        <button class="badge-tile ${cls}" data-badge-id="${b.id}">
          <div class="badge-tile-icon">${b.icon}</div>
          <div class="badge-tile-name">${escapeHtml(b.name)}</div>
          <div class="badge-tile-progress">
            <div class="badge-tile-progress-fill" style="width:${s.percent}%"></div>
          </div>
          <div class="badge-tile-progress-text">${progressText}</div>
        </button>
      `;
    }).join("");

    grid.querySelectorAll("[data-badge-id]").forEach(btn => {
      btn.addEventListener("click", () => openBadgeDetail(btn.dataset.badgeId));
    });

    if (cats) {
      cats.querySelectorAll("[data-cat]").forEach(chip => {
        chip.addEventListener("click", () => {
          badgeCategory = chip.dataset.cat;
          cats.querySelectorAll("[data-cat]").forEach(c =>
            c.classList.toggle("active", c === chip));
          renderBadgeGrid(state);
        });
      });
    }
  }

  function openBadgeDetail(badgeId) {
    const state = Storage.loadState();
    const s = Achievements.status(state, badgeId);
    if (!s) return;
    const b = s.badge;

    Sheet.open({
      title: `${b.icon} ${b.name}`,
      body: `
        <p class="confirm-text">${escapeHtml(b.description)}</p>
        <div class="setup-section-label">Progress</div>
        <div class="setup-summary">
          <span class="setup-summary-label">Current</span>
          <span class="setup-summary-value">${s.current} / ${s.target}</span>
        </div>
        <div class="bar" style="margin-top:10px">
          <div class="bar-fill" style="width:${s.percent}%"></div>
        </div>
        <div class="setup-section-label" style="margin-top:14px">Reward</div>
        <div class="setup-summary">
          <span class="setup-summary-label">On unlock</span>
          <span class="setup-summary-value">+${b.xp || 0} XP</span>
        </div>
        ${s.unlocked ? `
          <div class="setup-summary" style="margin-top:8px">
            <span class="setup-summary-label">Unlocked</span>
            <span class="setup-summary-value">${new Date(s.unlockedAt).toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"})}</span>
          </div>
        ` : ""}
      `,
      actions: [{ label: "Close", kind: "ghost" }]
    });
  }

  return { init, refresh };
})();

window.Progress = Progress;  /* expose for window.Progress checks in other modules */
