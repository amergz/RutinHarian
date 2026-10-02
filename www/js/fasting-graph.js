/* =========================================================
   fasting-graph.js — weekly fasting line graph
   (patched: human-friendly target label)
   ========================================================= */

const FastingGraph = (() => {

  let weekOffset = 0;
  let root = null;

  function init(container) {
    root = container;
    weekOffset = 0;
    render();
  }

  function refresh() { if (root) render(); }

  /* ---------- Week helpers ---------- */
  function getWeekRange(offset, base) {
    offset = offset || 0;
    base = base || new Date();
    const d = new Date(base);
    const day = (d.getDay() + 6) % 7;
    const monday = new Date(d);
    monday.setDate(d.getDate() - day + offset * 7);
    monday.setHours(0, 0, 0, 0);

    const days = [];
    for (let i = 0; i < 7; i++) {
      const dt = new Date(monday);
      dt.setDate(monday.getDate() + i);
      days.push(dt);
    }
    return { monday: monday, sunday: days[6], days: days };
  }

  function formatWeekLabel(range) {
    const a = range.monday.getDate();
    const b = range.sunday.getDate();
    const mA = range.monday.toLocaleDateString(undefined, { month: "short" }).toUpperCase();
    const mB = range.sunday.toLocaleDateString(undefined, { month: "short" }).toUpperCase();
    return mA === mB ? (a + "–" + b + " " + mA) : (a + " " + mA + " – " + b + " " + mB);
  }

  /* ---------- Data ---------- */
  function buildWeekData(state, range) {
    const todayKey = Storage.todayKey();
    const activeFast = state.fasting.active;

    return range.days.map(function (date) {
      const key = Storage.todayKey(date);
      const sessions = state.fasting.sessions.filter(function (s) { return s.date === key; });

      let session = null;
      if (sessions.length) session = sessions.find(function (s) { return s.completed; }) || sessions[0];

      let hours = session ? session.actualHours : 0;
      let status = session ? (session.completed ? "done" : "partial") : "none";

      if (key === todayKey && activeFast) {
        const elapsedMs = Date.now() - activeFast.startTs;
        hours = elapsedMs / 3600000;
        status = "active";
        session = null;
      }
      return { date: date, key: key, hours: hours, session: session, status: status };
    });
  }

  function hasAnyData(data) {
    return data.some(function (d) { return d.hours > 0 || d.session; });
  }

  /* ---------- Scale ---------- */
  function computeScale(data, targetHours) {
    const values = data.filter(function (d) { return d.hours > 0; }).map(function (d) { return d.hours; });
    if (targetHours) values.push(targetHours);
    if (!values.length) return { max: 24, step: 6, ticks: [0, 6, 12, 18, 24] };

    const highest = Math.max.apply(null, values.concat([4]));
    let max, step;
    if (highest <= 6)       { max = 6;   step = 2; }
    else if (highest <= 12) { max = 12;  step = 3; }
    else if (highest <= 18) { max = 18;  step = 6; }
    else if (highest <= 24) { max = 24;  step = 6; }
    else if (highest <= 36) { max = 36;  step = 6; }
    else                    { max = Math.ceil(highest / 12) * 12; step = max / 4; }

    const ticks = [];
    for (let v = 0; v <= max + 0.001; v += step) ticks.push(Math.round(v));
    return { max: max, step: step, ticks: ticks };
  }

  /* ---------- SVG constants ---------- */
  const VB_W = 340;
  const VB_H = 200;
  const PAD = { top: 14, right: 14, bottom: 30, left: 34 };
  const INNER_W = VB_W - PAD.left - PAD.right;
  const INNER_H = VB_H - PAD.top - PAD.bottom;

  function xFor(i) { return PAD.left + (INNER_W / 6) * i; }
  function yFor(h, scale) { return PAD.top + INNER_H - (h / scale.max) * INNER_H; }

  /* ---------- Render ---------- */
  function render() {
    if (!root) return;
    const state = Storage.loadState();
    const range = getWeekRange(weekOffset);
    const data  = buildWeekData(state, range);

    root.innerHTML = "";
    const card = document.createElement("div");
    card.className = "fasting-graph";
    card.innerHTML = [
      '<div class="graph-header">',
      '  <button class="graph-nav" data-nav="-1" aria-label="Previous week">‹</button>',
      '  <div class="graph-week-label">' + formatWeekLabel(range) + '</div>',
      '  <button class="graph-nav" data-nav="1" aria-label="Next week">›</button>',
      '</div>',
      '<div class="graph-svg-holder">',
      '  <svg class="graph-svg" viewBox="0 0 ' + VB_W + ' ' + VB_H + '" preserveAspectRatio="none">',
      '    <defs>',
      '      <linearGradient id="fastingAreaGradient" x1="0" y1="0" x2="0" y2="1">',
      '        <stop offset="0%"   stop-color="#4dd4ac" stop-opacity="0.35"/>',
      '        <stop offset="100%" stop-color="#4dd4ac" stop-opacity="0"/>',
      '      </linearGradient>',
      '    </defs>',
      '  </svg>',
      '  <div class="graph-tooltip" data-tooltip></div>',
      '</div>'
    ].join("");
    root.appendChild(card);

    card.querySelector('[data-nav="-1"]').addEventListener("click", function () {
      weekOffset -= 1; render();
    });
    card.querySelector('[data-nav="1"]').addEventListener("click", function () {
      if (weekOffset >= 0) return;
      weekOffset += 1; render();
    });
    const nextBtn = card.querySelector('[data-nav="1"]');
    if (weekOffset >= 0) nextBtn.setAttribute("disabled", "disabled");

    const svg = card.querySelector(".graph-svg");

    /* Empty state */
    if (!hasAnyData(data)) {
      const holder = card.querySelector(".graph-svg-holder");
      holder.innerHTML =
        '<div class="graph-empty" style="height:100%; display:grid; place-content:center;">' +
        '<strong>No fasting data yet</strong>' +
        'Complete your first fast to start seeing<br>your weekly trend.' +
        '</div>';
      return;
    }

    /* Target — median planned hours of visible sessions */
    const planned = data.filter(function (d) { return d.session; })
                        .map(function (d) { return d.session.plannedHours; });
    const targetHours = planned.length ? median(planned) : 16;

    const scale = computeScale(data, targetHours);

    /* Grid lines */
    const gridGroup = document.createElementNS(svg.namespaceURI, "g");
    scale.ticks.forEach(function (v) {
      const y = yFor(v, scale);
      gridGroup.innerHTML +=
        '<line class="graph-grid-line" x1="' + PAD.left + '" y1="' + y + '" x2="' + (PAD.left + INNER_W) + '" y2="' + y + '"/>' +
        '<text class="graph-axis-label" x="' + (PAD.left - 6) + '" y="' + (y + 3) + '" text-anchor="end">' + v + 'h</text>';
    });
    svg.appendChild(gridGroup);

    /* Target reference line */
    if (targetHours && targetHours <= scale.max) {
      const yT = yFor(targetHours, scale);
      const label = formatHours(targetHours);   /* ← human readable */
      svg.innerHTML +=
        '<line class="graph-target-line" x1="' + PAD.left + '" y1="' + yT + '" x2="' + (PAD.left + INNER_W) + '" y2="' + yT + '"/>' +
        '<text class="graph-target-label" x="' + (PAD.left + INNER_W - 4) + '" y="' + (yT - 4) + '" text-anchor="end">Target ' + label + '</text>';
    }

    /* Line points */
    const linePoints = [];
    data.forEach(function (d, i) {
      if (d.hours > 0) linePoints.push({ x: xFor(i), y: yFor(d.hours, scale), i: i, d: d });
    });

    /* Area */
    if (linePoints.length > 1) {
      const areaPts = ["M " + linePoints[0].x + " " + (PAD.top + INNER_H)]
        .concat(linePoints.map(function (p) { return "L " + p.x + " " + p.y; }))
        .concat(["L " + linePoints[linePoints.length - 1].x + " " + (PAD.top + INNER_H), "Z"])
        .join(" ");
      svg.innerHTML += '<path class="graph-area" d="' + areaPts + '"/>';
    }

    /* Line */
    if (linePoints.length >= 2) {
      const path = smoothPath(linePoints);
      svg.innerHTML += '<path class="graph-line" d="' + path + '"/>';
    }

    /* Points */
    data.forEach(function (d, i) {
      if (d.hours <= 0) return;
      const x = xFor(i);
      const y = yFor(d.hours, scale);
      const cls = d.status === "active" ? "active"
                : d.status === "partial" ? "partial"
                : "";
      const r = d.status === "active" ? 6 : 5;

      const circle = document.createElementNS(svg.namespaceURI, "circle");
      circle.setAttribute("class", "graph-point " + cls);
      circle.setAttribute("cx", x);
      circle.setAttribute("cy", y);
      circle.setAttribute("r", r);
      circle.dataset.index = i;
      circle.style.pointerEvents = "auto";
      circle.addEventListener("click", function (ev) {
        ev.stopPropagation();
        showTooltip(card, data, i, x, y, scale);
      });
      svg.appendChild(circle);
    });

    /* X labels */
    data.forEach(function (d, i) {
      const x = xFor(i);
      const isToday = d.key === Storage.todayKey();
      const label = d.date.toLocaleDateString(undefined, { weekday: "short" });
      svg.innerHTML +=
        '<text class="graph-x-label ' + (isToday ? "today" : "") + '" x="' + x + '" y="' + (VB_H - 8) + '" text-anchor="middle">' + label + '</text>';
    });

    card._weekData = data;
    card._scale = scale;
  }

  function smoothPath(points) {
    if (points.length < 2) return "";
    let d = "M " + points[0].x + " " + points[0].y;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i - 1] || points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] || p2;
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      d += " C " + cp1x + " " + cp1y + " " + cp2x + " " + cp2y + " " + p2.x + " " + p2.y;
    }
    return d;
  }

  /* ---------- Tooltip ---------- */
  function showTooltip(card, data, index, x, y, scale) {
    const tt = card.querySelector("[data-tooltip]");
    if (!tt) return;
    const d = data[index];
    const hours = d.hours;
    const hrs = formatHours(hours);

    const dateLabel = d.date
      .toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" })
      .toUpperCase();

    let statusLine = "";
    let metaLine = "";

    if (d.status === "active") {
      statusLine = '<span class="tt-status active">In Progress</span>';
      const active = Storage.loadState().fasting.active;
      if (active) {
        metaLine = "Target: " + formatHours(active.durationHours) + "<br>" +
                   "Started: " + Fasting.formatTime(active.startTs);
      }
    } else if (d.status === "done") {
      statusLine = '<span class="tt-status done">✓ Completed</span>';
      metaLine = "Target: " + formatHours(d.session.plannedHours) + "<br>" +
                 "Start: " + fmtShort(new Date(d.session.startTs)) + " • " + Fasting.formatTime(d.session.startTs) + "<br>" +
                 "End:&nbsp;&nbsp; " + fmtShort(new Date(d.session.endTs)) + " • " + Fasting.formatTime(d.session.endTs);
    } else if (d.status === "partial") {
      statusLine = '<span class="tt-status partial">Ended Early</span>';
      metaLine = "Target: " + formatHours(d.session.plannedHours) + "<br>" +
                 "Start: " + fmtShort(new Date(d.session.startTs)) + " • " + Fasting.formatTime(d.session.startTs) + "<br>" +
                 "End:&nbsp;&nbsp; " + fmtShort(new Date(d.session.endTs)) + " • " + Fasting.formatTime(d.session.endTs);
    }

    tt.innerHTML =
      '<span class="tt-day">' + dateLabel + '</span>' +
      '<div class="tt-hours">' + hrs + '</div>' +
      statusLine +
      (metaLine ? '<div class="tt-meta">' + metaLine + '</div>' : "");

    const holder = card.querySelector(".graph-svg-holder");
    const rectW = holder.clientWidth;
    const rectH = holder.clientHeight;
    const px = (x / VB_W) * rectW;
    const py = (y / VB_H) * rectH;

    tt.classList.add("visible");
    const tw = tt.offsetWidth;
    const th = tt.offsetHeight;
    let left = px - tw / 2;
    let top  = py - th - 12;

    left = Math.max(4, Math.min(left, rectW - tw - 4));
    if (top < 4) top = py + 14;

    tt.style.left = left + "px";
    tt.style.top  = top + "px";
  }

  document.addEventListener("click", function (e) {
    const tt = document.querySelector(".graph-tooltip.visible");
    if (tt && !tt.contains(e.target) && !e.target.classList?.contains("graph-point")) {
      tt.classList.remove("visible");
    }
  });

  /* ---------- Helpers ---------- */
  function formatHours(h) {
    if (!h || h <= 0) return "0h";
    /* Sub-hour: show minutes */
    if (h < 1) {
      const mins = Math.round(h * 60);
      return mins + " min";
    }
    const hh = Math.floor(h);
    const mm = Math.round((h - hh) * 60);
    if (mm === 0) return hh + "h";
    return hh + "h " + mm + "m";
  }

  function fmtShort(d) {
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  }

  function median(arr) {
    if (!arr.length) return 0;
    const s = arr.slice().sort(function (a, b) { return a - b; });
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  return { init: init, refresh: refresh };
})();