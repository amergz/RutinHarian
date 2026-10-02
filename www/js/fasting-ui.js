/* =========================================================
   fasting-ui.js — Half-circle fasting progress (Design A)
   Presentation only. No business logic changed.
   ========================================================= */

const FastingUI = (() => {

  let tickHandle = null;
  const els = {};

  const MODE_KEY = "routineFast.fastingDisplayMode";
  let displayMode = localStorage.getItem(MODE_KEY) || "elapsed";

  /* ---------- Half-circle geometry ----------
     viewBox 0 0 340 200
     center (170, 175)
     radius 140
     start (30, 175) → arc → end (310, 175)
  -------------------------------------------- */
  const ARC = {
    cx: 170,
    cy: 175,
    r:  140,
    startX: 30,
    startY: 175,
    endX:   310,
    endY:   175,
    totalLen: Math.PI * 140
  };

  const ARC_PATH = 'M ' + ARC.startX + ' ' + ARC.startY +
                   ' A ' + ARC.r + ' ' + ARC.r + ' 0 0 1 ' +
                   ARC.endX + ' ' + ARC.endY;

  function init(els_) { Object.assign(els, els_); }

  function render(state) {
    const active = Fasting.isFasting(state);
    els.idle.hidden   = active;
    els.active.hidden = !active;
    if (active) renderActive(state);
    else        stopTick();
    if (els.history) { els.history.hidden = true; els.history.innerHTML = ""; }
  }

  /* ---------- Gradient stops ---------- */
  const STOPS = [
    { at: 0.00, c: [90, 125, 255] },
    { at: 0.20, c: [80, 170, 255] },
    { at: 0.40, c: [77, 212, 255] },
    { at: 0.60, c: [77, 212, 200] },
    { at: 0.75, c: [77, 212, 172] },
    { at: 0.90, c: [245, 166, 35] },
    { at: 1.00, c: [239, 93, 107] }
  ];

  function colorAt(t) {
    t = Math.max(0, Math.min(1, t));
    let a = STOPS[0], b = STOPS[STOPS.length - 1];
    for (let i = 0; i < STOPS.length - 1; i++) {
      if (t >= STOPS[i].at && t <= STOPS[i + 1].at) { a = STOPS[i]; b = STOPS[i + 1]; break; }
    }
    const span = (b.at - a.at) || 1;
    const l = (t - a.at) / span;
    return [
      Math.round(a.c[0] + (b.c[0] - a.c[0]) * l),
      Math.round(a.c[1] + (b.c[1] - a.c[1]) * l),
      Math.round(a.c[2] + (b.c[2] - a.c[2]) * l)
    ];
  }
  function colorAtCss(t, alpha) {
    const c = colorAt(t);
    return alpha == null
      ? "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")"
      : "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + alpha + ")";
  }
  function buildGradientStops(progress) {
    const p = Math.max(0.001, Math.min(1, progress));
    const revealed = STOPS.filter(s => s.at <= p);
    const html = revealed.map(s =>
      '<stop offset="' + (s.at * 100).toFixed(1) + '%" stop-color="rgb(' +
      s.c[0] + ',' + s.c[1] + ',' + s.c[2] + ')"/>').join("");
    const end = colorAt(p);
    return html + '<stop offset="100%" stop-color="rgb(' +
      end[0] + ',' + end[1] + ',' + end[2] + ')"/>';
  }

  /* =========================================================
     Active view
     ========================================================= */
  function renderActive(state) {
    const status = Fasting.computeStatus(state);
    if (!status) return;

    const progress = Math.max(0, Math.min(1, status.progress));
    const dashLen  = ARC.totalLen;
    const dashOff  = dashLen * (1 - progress);
    const endpointColor = colorAtCss(progress);
    const isComplete = status.complete || progress >= 0.999;
    const cur = status.currentStage;
    const nxt = status.nextStage;

    const angle = Math.PI * (1 - progress);
    const ex = ARC.cx + ARC.r * Math.cos(angle);
    const ey = ARC.cy - ARC.r * Math.sin(angle);

    const visibleLen = dashLen * progress;

    els.active.innerHTML = [
      '<div class="fasting-card-new' + (isComplete ? " is-complete" : "") + '">',

      /* Header */
      '  <div class="fc-header">',
      '    <div class="fc-plan">',
      '      <span class="fc-plan-name">' + escapeHtml(status.plan) + '</span>',
      '      <span class="fc-plan-dur">' + status.targetHours + 'H</span>',
      '    </div>',
      '    <div class="fc-status"><span class="fc-status-dot"></span>In Progress</div>',
      '  </div>',

      /* Arc + center block (single wrapper for correct positioning) */
      '  <div class="fc-arc-wrap">',
      '    <svg class="fc-arc" viewBox="0 0 340 200" preserveAspectRatio="xMidYMid meet" aria-hidden="true">',
      '      <defs>',
      '        <linearGradient id="fcGrad" x1="0" y1="0" x2="1" y2="0">',
      buildGradientStops(progress),
      '        </linearGradient>',
      '        <filter id="fcGlowTight" x="-20%" y="-20%" width="140%" height="140%">',
      '          <feGaussianBlur stdDeviation="2.2" result="b"/>',
      '          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>',
      '        </filter>',
      '        <filter id="fcGlowSoft" x="-30%" y="-30%" width="160%" height="160%">',
      '          <feGaussianBlur stdDeviation="6"/>',
      '        </filter>',
      '      </defs>',

      '      <path class="fc-track" d="' + ARC_PATH + '"/>',

      '      <path class="fc-glow-soft" d="' + ARC_PATH + '"',
      '            stroke="' + endpointColor + '"',
      '            stroke-dasharray="' + dashLen + '"',
      '            stroke-dashoffset="' + dashOff + '"',
      '            filter="url(#fcGlowSoft)"/>',

      '      <path class="fc-fill" d="' + ARC_PATH + '"',
      '            stroke="url(#fcGrad)"',
      '            stroke-dasharray="' + dashLen + '"',
      '            stroke-dashoffset="' + dashOff + '"',
      '            filter="url(#fcGlowTight)"/>',

      (progress > 0.02 ? (
        '      <path class="fc-highlight" d="' + ARC_PATH + '"',
        '            stroke="' + endpointColor + '"',
        '            stroke-dasharray="' + (visibleLen * 0.14) + ' ' + (dashLen - visibleLen * 0.14) + '"',
        '            style="--arc-len:' + visibleLen + 'px;"',
        '            filter="url(#fcGlowTight)"/>'
      ) : ""),

      (progress > 0.005 && progress < 0.999 ? (
        '      <circle class="fc-endpoint" cx="' + ex.toFixed(2) + '" cy="' + ey.toFixed(2) + '" r="6"',
        '              fill="#ffffff" stroke="' + endpointColor + '" stroke-width="3"/>'
      ) : ""),

      '    </svg>',

      /* 0% / 100% labels */
      '    <div class="fc-axis">',
      '      <span>0%</span>',
      '      <span>100%</span>',
      '    </div>',

      /* Center overlay — positioned relative to arc-wrap */
      '    <div class="fc-center" data-ring-center role="button" tabindex="0"',
      '         aria-label="Tap to switch between elapsed and remaining">',
      '      <span class="fc-label">FASTING</span>',
      '      <span class="fc-time" data-ring-time>' + currentTimeString(status) + '</span>',
      '      <span class="fc-mode" data-ring-mode>' + displayMode + '</span>',
      '      <span class="fc-percent" data-ring-percent',
      '            style="color:' + endpointColor + '">' + currentPercent(status) + '%</span>',
      '      <span class="fc-remaining" data-ring-remaining>' +
             Fasting.formatDuration(status.remainMs) + ' remaining</span>',
      '    </div>',
      '  </div>',

      /* Start / Target */
      '  <div class="fc-meta-grid">',
      '    <div class="fc-meta-card">',
      '      <span class="fc-meta-label">START</span>',
      '      <span class="fc-meta-date">' + formatChipDate(status.startTs) + '</span>',
      '      <span class="fc-meta-time">' + formatTimeByHourFormat(status.startTs) + '</span>',
      '    </div>',
      '    <div class="fc-meta-card">',
      '      <span class="fc-meta-label">TARGET</span>',
      '      <span class="fc-meta-date">' + formatChipDate(status.targetTs) + '</span>',
      '      <span class="fc-meta-time">' + formatTimeByHourFormat(status.targetTs) + '</span>',
      '    </div>',
      '  </div>',

      /* Stage */
      '  <div class="fc-stage">',
      '    <span class="fc-stage-label">CURRENT STAGE</span>',
      '    <span class="fc-stage-title">' + cur.icon + ' ' + cur.title + '</span>',
      '    <span class="fc-stage-desc">' + cur.desc + '</span>',
      '  </div>',

      (nxt ? (
        '<div class="fc-stage fc-stage-next">' +
        '  <span class="fc-stage-label">NEXT MILESTONE</span>' +
        '  <span class="fc-stage-title">' + nxt.icon + ' ' + nxt.title + '</span>' +
        '  <span class="fc-stage-remaining">in ' + Fasting.formatDuration(status.nextRemainMs) + '</span>' +
        '</div>'
      ) : ""),

      '  <div class="fc-controls">',
      '    <button class="fc-end-btn" id="fasting-end-btn">',
      '      <span class="fc-end-icon">■</span> ' + (status.complete ? "Finish Fast" : "End Fast"),
      '    </button>',
      '    <button class="fc-options-btn" id="fasting-options-btn" aria-label="Options">•••</button>',
      '  </div>',

      '</div>'
    ].join("");

    const endBtn = els.active.querySelector("#fasting-end-btn");
    if (endBtn) endBtn.addEventListener("click", () => handleEndClick(state));
    const optBtn = els.active.querySelector("#fasting-options-btn");
    if (optBtn) optBtn.addEventListener("click", () => openActiveOptions(state));

    const ringCenter = els.active.querySelector("[data-ring-center]");
    if (ringCenter) {
      ringCenter.addEventListener("click", toggleDisplayMode);
      ringCenter.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleDisplayMode(); }
      });
    }

    startTick(state);
  }

  function toggleDisplayMode() {
    displayMode = displayMode === "elapsed" ? "remaining" : "elapsed";
    localStorage.setItem(MODE_KEY, displayMode);
    const state = Storage.loadState();
    const status = Fasting.computeStatus(state);
    if (!status) return;
    const timeEl = els.active.querySelector("[data-ring-time]");
    const modeEl = els.active.querySelector("[data-ring-mode]");
    if (timeEl) timeEl.textContent = currentTimeString(status);
    if (modeEl) modeEl.textContent = displayMode;
  }

  function currentTimeString(status) {
    if (displayMode === "remaining") return Fasting.formatHMS(status.remainMs);
    return Fasting.formatHMS(status.elapsedMs);
  }
  function currentPercent(status) {
    if (displayMode === "remaining") return Math.max(0, 100 - status.percent);
    return status.percent;
  }
  function formatChipDate(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }
  function formatTimeByHourFormat(ts) {
    const s = Storage.loadState();
    const hourFormat = (s.settings && s.settings.hourFormat) || "24h";
    return new Date(ts).toLocaleTimeString(undefined, {
      hour: "numeric", minute: "2-digit", hour12: hourFormat === "12h"
    });
  }

  function startTick(state) {
    stopTick();
    tickHandle = setInterval(function () {
      const status = Fasting.computeStatus(state);
      if (!status) { stopTick(); return; }

      const progress = Math.max(0, Math.min(1, status.progress));
      const dashLen = ARC.totalLen;
      const dashOff = dashLen * (1 - progress);
      const col = colorAtCss(progress);

      const fill = els.active.querySelector(".fc-fill");
      const soft = els.active.querySelector(".fc-glow-soft");
      const hl   = els.active.querySelector(".fc-highlight");
      const end  = els.active.querySelector(".fc-endpoint");

      if (fill) fill.setAttribute("stroke-dashoffset", dashOff);
      if (soft) {
        soft.setAttribute("stroke-dashoffset", dashOff);
        soft.setAttribute("stroke", col);
      }
      if (hl) {
        const vis = dashLen * progress;
        hl.setAttribute("stroke-dasharray", (vis * 0.14) + " " + dashLen);
        hl.style.setProperty("--arc-len", vis + "px");
        hl.setAttribute("stroke", col);
      }
      if (end) {
        const angle = Math.PI * (1 - progress);
        const x = ARC.cx + ARC.r * Math.cos(angle);
        const y = ARC.cy - ARC.r * Math.sin(angle);
        end.setAttribute("cx", x.toFixed(2));
        end.setAttribute("cy", y.toFixed(2));
        end.setAttribute("stroke", col);
      }

      const time = els.active.querySelector("[data-ring-time]");
      const pct  = els.active.querySelector("[data-ring-percent]");
      const rem  = els.active.querySelector("[data-ring-remaining]");
      if (time) time.textContent = currentTimeString(status);
      if (pct)  { pct.textContent = currentPercent(status) + "%"; pct.style.color = col; }
      if (rem)  rem.textContent = Fasting.formatDuration(status.remainMs) + " remaining";

      maybeShowMilestone(state, status);
    }, 1000);
  }
  function stopTick() {
    if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
  }

  function maybeShowMilestone(state, status) {
    const active = state.fasting.active;
    if (!active) return;
    Fasting.MILESTONES.forEach(function (m, idx) {
      if (idx === 0) return;
      if (status.elapsedHours < m.from) return;
      if (active.milestonesHit.indexOf(idx) !== -1) return;
      active.milestonesHit.push(idx);
      Storage.saveState(state);
      if (m.from >= 12 && m.from <= 24) {
        showMilestonePopup({ icon: m.icon, hours: m.from, title: m.title, xp: 100 });
      }
    });
  }
  function showMilestonePopup(opts) {
    const host = document.getElementById("achievement-host");
    if (!host) return;
    host.innerHTML = "";
    const backdrop = document.createElement("div");
    backdrop.className = "achv-backdrop";
    backdrop.innerHTML = [
      '<div class="achv-card">',
      '  <div class="achv-badge">🏆</div>',
      '  <div class="achv-tag">Milestone Reached</div>',
      '  <div class="achv-title">' + opts.hours + ' HOURS</div>',
      '  <div class="achv-name">' + opts.icon + ' ' + opts.title + '</div>',
      '  <div class="achv-xp">+' + opts.xp + ' XP</div>',
      '  <button class="btn btn-primary" data-close>Continue</button>',
      '</div>'
    ].join("");
    host.appendChild(backdrop);
    const close = () => { host.innerHTML = ""; };
    backdrop.querySelector("[data-close]").addEventListener("click", close);
    backdrop.addEventListener("click", e => { if (e.target === backdrop) close(); });
  }

  function openActiveOptions(state) {
    Sheet.openOptions({
      title: "Fasting Options",
      items: [
        { icon: "✏️", label: "Edit Fast", onClick: () => openEditActive(state) },
        { icon: "⚙️", label: "Adjust Target", onClick: () => openEditActive(state) },
        { icon: "🔁", label: "Switch View (" + (displayMode === "elapsed" ? "Elapsed" : "Remaining") + ")",
          onClick: () => toggleDisplayMode() },
        { icon: "🗑️", label: "Delete / Cancel Fast", kind: "danger",
          onClick: () => confirmDeleteActive(state) }
      ]
    });
  }

  function openEditActive(state) {
    const a = state.fasting.active;
    if (!a) return;
    const start = new Date(a.startTs);
    const end   = new Date(a.targetTs);

    Sheet.open({
      title: "Edit Active Fast",
      body: [
        '<div class="setup-section-label">Start</div>',
        '<div class="setup-row">',
        '  <label class="field"><span>Date</span>',
        '    <input id="edit-start-date" type="date" value="' + toDateInputValue(start) + '">',
        '  </label>',
        '  <label class="field"><span>Time</span>',
        '    <input id="edit-start-time" type="time" value="' + toTimeInputValue(start) + '">',
        '  </label>',
        '</div>',
        '<div class="setup-section-label">End</div>',
        '<div class="setup-row">',
        '  <label class="field"><span>Date</span>',
        '    <input id="edit-end-date" type="date" value="' + toDateInputValue(end) + '">',
        '  </label>',
        '  <label class="field"><span>Time</span>',
        '    <input id="edit-end-time" type="time" value="' + toTimeInputValue(end) + '">',
        '  </label>',
        '</div>',
        '<div class="setup-error" id="edit-error" hidden></div>'
      ].join(""),
      actions: [
        { label: "Cancel", kind: "ghost" },
        { label: "Save", kind: "primary", onClick: () => {
          const newStart = buildTs(
            document.getElementById("edit-start-date").value,
            document.getElementById("edit-start-time").value
          );
          const newEnd = buildTs(
            document.getElementById("edit-end-date").value,
            document.getElementById("edit-end-time").value
          );
          if (newStart == null || newEnd == null || newEnd <= newStart) {
            const errEl = document.getElementById("edit-error");
            if (errEl) { errEl.hidden = false; errEl.textContent = "End time must be later than start time."; }
            return false;
          }
          const s = Storage.loadState();
          Fasting.updateActiveFast(s, { startTs: newStart, targetTs: newEnd });
          render(s);
          if (window.App && window.App.refreshFastingOnly) window.App.refreshFastingOnly();
        }}
      ]
    });
  }

  function confirmDeleteActive(state) {
    Sheet.confirm({
      title: "Delete Fast?",
      message: "This will remove the current fasting session. It will not count as completed and will not appear in history. This action cannot be undone.",
      confirmLabel: "Delete Fast",
      cancelLabel: "Keep Fast",
      confirmKind: "danger",
      onConfirm: () => {
        const s = Storage.loadState();
        Fasting.deleteActiveFast(s);
        stopTick();
        render(s);
        if (window.App && window.App.refreshFastingOnly) window.App.refreshFastingOnly();
      }
    });
  }

  function handleEndClick(state) {
    const status = Fasting.computeStatus(state);
    if (!status) return;
    if (status.complete) { finishFast(state, true); return; }

    Sheet.open({
      title: "End fasting early?",
      body: '<p class="confirm-text">Elapsed: <strong>' + formatShort(status.elapsedHours) +
            '</strong><br>Target:  <strong>' + status.targetHours + 'h</strong><br><br>' +
            'The session will be saved as incomplete.</p>',
      actions: [
        { label: "Continue Fasting", kind: "ghost" },
        { label: "End Fast", kind: "primary", onClick: () => finishFast(state, false) }
      ]
    });
  }
  function finishFast(state, forcedComplete) {
    const result = Fasting.endFasting(Storage.loadState(), forcedComplete);
    if (!result) return;
    showCompletionModal(result.session);
    const s = Storage.loadState();
    render(s);
    if (window.App && window.App.refreshFastingOnly) window.App.refreshFastingOnly();
  }
  function showCompletionModal(session) {
    const hours = session.actualHours.toFixed(2).replace(/\.00$/, "");
    const host = document.getElementById("achievement-host");
    if (!host) return;
    host.innerHTML = "";
    const backdrop = document.createElement("div");
    backdrop.className = "achv-backdrop";
    backdrop.innerHTML = [
      '<div class="achv-card">',
      '  <div class="achv-badge">' + (session.completed ? "🏆" : "⏱️") + '</div>',
      '  <div class="achv-tag">' + (session.completed ? "Fast Complete!" : "Fast Ended") + '</div>',
      '  <div class="achv-title">' + hours + 'h ' + (session.completed ? "✓" : "") + '</div>',
      '  <div class="achv-name">' + escapeHtml(session.plan) + ' · ' + (session.completed ? "Goal Completed" : "Incomplete") + '</div>',
      '  <div class="achv-xp">+' + (session.completed ? 30 : 5) + ' XP</div>',
      '  <button class="btn btn-primary" data-close>Finish</button>',
      '</div>'
    ].join("");
    host.appendChild(backdrop);
    backdrop.querySelector("[data-close]").addEventListener("click", () => { host.innerHTML = ""; });
  }

  function openPlanPicker(state, isChange) {
    isChange = !!isChange;
    const root = document.getElementById("fasting-setup-host");
    root.innerHTML = "";

    const current = state.fasting.active;
    const now = new Date();
    const defaultHours = current ? current.durationHours : 16;
    const defaultPlan  = current ? current.plan : "16:8";
    const presetMatch  = Fasting.PRESETS.find(p => p.id === defaultPlan);
    let chosenPlan = presetMatch ? presetMatch.id : "custom";

    const defaultStart = current ? new Date(current.startTs) : now;
    const startDate = toDateInputValue(defaultStart);
    const startTime = toTimeInputValue(defaultStart);
    const endDate   = toDateInputValue(new Date(defaultStart.getTime() + defaultHours * 3600000));
    const endTime   = toTimeInputValue(new Date(defaultStart.getTime() + defaultHours * 3600000));

    const backdrop = document.createElement("div");
    backdrop.className = "achv-backdrop";
    backdrop.innerHTML = [
      '<div class="confirm-card fasting-setup-sheet" style="max-width:420px">',
      '  <div class="confirm-title">' + (isChange ? "Change Fasting Plan" : "Start Fasting") + '</div>',
      '  <p class="confirm-text" style="margin-bottom:14px">Pick a plan or customise start & end times.</p>',
      '  <div class="plan-grid" data-plans>',
      Fasting.PRESETS.map(p =>
        '<button class="plan-btn" data-plan="' + p.id + '">' +
        '<span class="plan-main">' + p.id + '</span>' +
        '<span class="plan-sub">' + p.fast + 'h · ' + p.eat + 'h</span></button>'
      ).join(""),
      '    <button class="plan-btn" data-plan="custom">',
      '      <span class="plan-main">Custom</span>',
      '      <span class="plan-sub">set hours</span>',
      '    </button>',
      '  </div>',
      '  <label class="field" data-custom-wrap hidden style="margin-top:10px">',
      '    <span>Fasting duration (hours)</span>',
      '    <input name="customHours" type="number" min="1" max="24" value="' + defaultHours + '">',
      '  </label>',
      '  <div class="setup-section-label">Start</div>',
      '  <div class="setup-row">',
      '    <label class="field"><span>Date</span>',
      '      <input name="startDate" type="date" value="' + startDate + '">',
      '    </label>',
      '    <label class="field"><span>Time</span>',
      '      <input name="startTime" type="time" value="' + startTime + '">',
      '    </label>',
      '  </div>',
      '  <div class="setup-section-label">End</div>',
      '  <div class="setup-row">',
      '    <label class="field"><span>Date</span>',
      '      <input name="endDate" type="date" value="' + endDate + '">',
      '    </label>',
      '    <label class="field"><span>Time</span>',
      '      <input name="endTime" type="time" value="' + endTime + '">',
      '    </label>',
      '  </div>',
      '  <div class="setup-summary">',
      '    <span class="setup-summary-label">Duration</span>',
      '    <span class="setup-summary-value" data-duration>' + defaultHours + ' Hours</span>',
      '  </div>',
      '  <div class="setup-error" data-error hidden></div>',
      '  <div class="confirm-actions" style="margin-top:18px">',
      '    <button class="btn btn-ghost" data-cancel>Cancel</button>',
      '    <button class="btn btn-primary" data-start>' + (isChange ? "Restart Fast" : "Start Fasting") + '</button>',
      '  </div>',
      '</div>'
    ].join("");
    root.appendChild(backdrop);

    const customWrap = backdrop.querySelector("[data-custom-wrap]");
    const customInput = backdrop.querySelector('[name="customHours"]');
    const startD = backdrop.querySelector('[name="startDate"]');
    const startT = backdrop.querySelector('[name="startTime"]');
    const endD   = backdrop.querySelector('[name="endDate"]');
    const endT   = backdrop.querySelector('[name="endTime"]');
    const durEl  = backdrop.querySelector("[data-duration]");
    const errEl  = backdrop.querySelector("[data-error]");

    const readStart = () => buildTs(startD.value, startT.value);
    const readEnd   = () => buildTs(endD.value, endT.value);

    function setEndFromDuration(hours) {
      const s = readStart();
      if (s == null) return;
      const e = new Date(s + hours * 3600000);
      endD.value = toDateInputValue(e);
      endT.value = toTimeInputValue(e);
    }
    function autoDetectPlan() {
      const s = readStart(), e = readEnd();
      if (s == null || e == null || e <= s) return;
      const hours = (e - s) / 3600000;
      const preset = Fasting.PRESETS.find(p => Math.abs(p.fast - hours) < 0.01);
      chosenPlan = preset ? preset.id : "custom";
      if (!preset) customInput.value = Math.round(hours);
      markChosen();
    }
    function refreshDuration() {
      const s = readStart(), e = readEnd();
      if (s == null || e == null) { durEl.textContent = "—"; return; }
      const diffMs = e - s;
      if (diffMs <= 0) {
        errEl.hidden = false;
        errEl.textContent = "End time must be later than start time.";
        durEl.textContent = "—";
        return;
      }
      errEl.hidden = true;
      const hours = diffMs / 3600000;
      const hh = Math.floor(hours);
      const mm = Math.round((hours - hh) * 60);
      durEl.textContent = mm ? (hh + " Hours " + mm + " min") : (hh + " Hours");
    }
    function markChosen() {
      backdrop.querySelectorAll("[data-plan]").forEach(b =>
        b.classList.toggle("active", b.dataset.plan === chosenPlan));
      customWrap.hidden = chosenPlan !== "custom";
      if (chosenPlan === "custom" && !customInput.value) customInput.value = defaultHours;
    }
    markChosen();
    refreshDuration();

    backdrop.querySelectorAll("[data-plan]").forEach(b => {
      b.addEventListener("click", () => {
        chosenPlan = b.dataset.plan;
        markChosen();
        if (chosenPlan !== "custom") {
          const p = Fasting.PRESETS.find(x => x.id === chosenPlan);
          setEndFromDuration(p.fast);
        } else {
          const h = Number(customInput.value) || 16;
          setEndFromDuration(h);
        }
        refreshDuration();
      });
    });
    customInput.addEventListener("input", () => {
      if (chosenPlan !== "custom") return;
      const h = Math.max(1, Math.min(24, Number(customInput.value) || 1));
      setEndFromDuration(h);
      refreshDuration();
    });
    function onStartChange() {
      let hours;
      if (chosenPlan === "custom") hours = Number(customInput.value) || 16;
      else hours = Fasting.PRESETS.find(p => p.id === chosenPlan).fast;
      setEndFromDuration(hours);
      refreshDuration();
    }
    startD.addEventListener("change", onStartChange);
    startT.addEventListener("change", onStartChange);
    endD.addEventListener("change", () => { autoDetectPlan(); refreshDuration(); });
    endT.addEventListener("change", () => { autoDetectPlan(); refreshDuration(); });

    const close = () => root.innerHTML = "";
    backdrop.querySelector("[data-cancel]").addEventListener("click", close);
    backdrop.querySelector("[data-start]").addEventListener("click", () => {
      const s = readStart(), e = readEnd();
      if (s == null || e == null) {
        errEl.hidden = false; errEl.textContent = "Please enter both start and end.";
        return;
      }
      if (e <= s) {
        errEl.hidden = false; errEl.textContent = "End time must be later than start time.";
        return;
      }
      const state2 = Storage.loadState();
      if (isChange) state2.fasting.active = null;
      const hours = (e - s) / 3600000;
      const plan  = chosenPlan === "custom" ? null : chosenPlan;
      Fasting.startFasting(state2, plan, hours, s);
      close();
      render(state2);
      if (window.App && window.App.refreshFastingOnly) window.App.refreshFastingOnly();
    });
  }

  function toDateInputValue(d) {
    return d.getFullYear() + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
  }
  function toTimeInputValue(d) {
    return String(d.getHours()).padStart(2, "0") + ":" +
           String(d.getMinutes()).padStart(2, "0");
  }
  function buildTs(dateStr, timeStr) {
    if (!dateStr || !timeStr) return null;
    const d = dateStr.split("-").map(Number);
    const t = timeStr.split(":").map(Number);
    return new Date(d[0], d[1] - 1, d[2], t[0], t[1], 0, 0).getTime();
  }
  function formatShort(hours) {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return h + "h " + m + "m";
  }
  function escapeHtml(str) {
    return String(str || "").replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  return { init, render, openPlanPicker };
})();

window.FastingUI = FastingUI;  /* expose for window.FastingUI checks in other modules */
