/* =========================================================
   calendar.js — Calendar + Week Preview + To-Do + Notes
   FIX: refresh() always re-reads from Storage
   NEW: Week preview strip when calendar collapsed
   ========================================================= */

const Calendar = (() => {

  let state;
  let view = new Date();
  let selectedKey = Storage.todayKey();
  let els = {};

  function init(rootEls, st) {
    els = rootEls;
    state = Storage.loadState();
    els.prev.addEventListener("click", () => shiftMonth(-1));
    els.next.addEventListener("click", () => shiftMonth(1));
    els.monthLabel.addEventListener("click", jumpToToday);
    els.todayBtn.addEventListener("click", jumpToToday);
    view = new Date();
    view.setDate(1);
    render();
  }

  function refresh(st) {
    state = Storage.loadState();
    render();
  }

  function shiftMonth(d) { view.setMonth(view.getMonth() + d); render(); }
  function jumpToToday() {
    view = new Date();
    view.setDate(1);
    selectedKey = Storage.todayKey();
    render();
  }

  function render() {
    renderHeader();
    renderGrid();
    renderWeekPreview();
    renderDetail();
  }

  function renderHeader() {
    els.monthLabel.textContent = view.toLocaleDateString(undefined, {
      month: "long", year: "numeric"
    }).toUpperCase();
  }

  /* ---------- Full month grid ---------- */
  function renderGrid() {
    const grid = els.grid;
    grid.innerHTML = "";
    const year = view.getFullYear();
    const month = view.getMonth();
    const first = new Date(year, month, 1);
    const startIdx = (first.getDay() + 6) % 7;
    const todayKey = Storage.todayKey();

    for (let i = 0; i < 42; i++) {
      const cellDate = new Date(year, month, 1 - startIdx + i);
      const key = Storage.todayKey(cellDate);
      const inMonth = cellDate.getMonth() === month;
      const isToday = key === todayKey;
      const isFuture = cellDate.getTime() > Date.now() + 86400000 * 0.5;

      const cell = document.createElement("button");
      cell.className = "cal-cell";
      if (!inMonth) cell.classList.add("other-month");
      if (isToday)  cell.classList.add("today");
      if (isFuture) cell.classList.add("future");
      if (key === selectedKey) cell.classList.add("selected");

      cell.innerHTML = [
        '<span class="cal-num">' + cellDate.getDate() + '</span>',
        buildDots(key, cellDate)
      ].join("");

      cell.addEventListener("click", () => {
        selectedKey = key;
        renderGrid();
        renderWeekPreview();
        renderDetail();
      });
      grid.appendChild(cell);
    }
  }

  /* ---------- Week Preview (when calendar collapsed) ---------- */
  function renderWeekPreview() {
    const preview = els.weekPreview;
    if (!preview) return;

    const collapsible = els.collapsible;
    const isCollapsed = collapsible && collapsible.classList.contains("collapsed");
    preview.hidden = !isCollapsed;
    if (!isCollapsed) { preview.innerHTML = ""; return; }

    const parts = selectedKey.split("-").map(Number);
    const selected = new Date(parts[0], parts[1] - 1, parts[2]);
    const dow = (selected.getDay() + 6) % 7;
    const monday = new Date(selected);
    monday.setDate(selected.getDate() - dow);

    const todayKey = Storage.todayKey();

    preview.innerHTML = "";

    const strip = document.createElement("div");
    strip.className = "cal-week-strip";

    for (let i = 0; i < 7; i++) {
      const day = new Date(monday);
      day.setDate(monday.getDate() + i);
      const key = Storage.todayKey(day);
      const isToday = key === todayKey;
      const isSelected = key === selectedKey;

      const chip = document.createElement("button");
      chip.className = "cal-week-chip";
      if (isToday)    chip.classList.add("today");
      if (isSelected) chip.classList.add("selected");

      const dayLabel = day.toLocaleDateString(undefined, { weekday: "narrow" });
      const dayNum = day.getDate();
      const dots = buildWeekDots(key, day);

      chip.innerHTML = [
        '<span class="cal-week-day">' + dayLabel + '</span>',
        '<span class="cal-week-num">' + dayNum + '</span>',
        dots
      ].join("");

      chip.addEventListener("click", () => {
        selectedKey = key;
        renderGrid();
        renderWeekPreview();
        renderDetail();
      });

      strip.appendChild(chip);
    }

    preview.appendChild(strip);

    const rangeLabel = document.createElement("div");
    rangeLabel.className = "cal-week-range";
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const fmtMon = monday.toLocaleDateString(undefined, { day: "numeric", month: "short" });
    const fmtSun = sunday.toLocaleDateString(undefined, { day: "numeric", month: "short" });
    rangeLabel.textContent = fmtMon + " – " + fmtSun;
    preview.appendChild(rangeLabel);
  }

  function buildWeekDots(key, date) {
    const dots = [];
    const dayActs = state.activities.filter(a =>
      a.targetPeriod === "day" && isScheduledOn(a, date));
    let anyProgress = false;
    dayActs.forEach(a => { if (((state.dailyLog[key] || {})[a.id] || 0) > 0) anyProgress = true; });
    if (anyProgress) dots.push("activity");
    if (Storage.getFastingSessionsEndingOn(state, key).length) dots.push("fasting");
    if (Todos.hasTasksOn(state, key)) dots.push("task");
    if (Notes.hasNotesOn(state, key)) dots.push("note");

    return '<span class="cal-week-dots">' +
      dots.slice(0, 3).map(c => '<span class="cal-week-dot ' + c + '"></span>').join("") +
      '</span>';
  }

  function buildDots(key, date) {
    const dots = [];
    const dayActs = state.activities.filter(a =>
      a.targetPeriod === "day" && isScheduledOn(a, date));
    let anyProgress = false;
    dayActs.forEach(a => { if (((state.dailyLog[key] || {})[a.id] || 0) > 0) anyProgress = true; });
    if (anyProgress) dots.push("activity");
    if (Storage.getFastingSessionsEndingOn(state, key).length) dots.push("fasting");
    if (Todos.hasTasksOn(state, key)) dots.push("task");
    if (Notes.hasNotesOn(state, key)) dots.push("note");

    return '<span class="cal-mini-dots">' +
      dots.slice(0, 3).map(c => '<span class="cal-mini-dot ' + c + '"></span>').join("") +
      '</span>';
  }

  function dayStatus(date) {
    const key = Storage.todayKey(date);
    const scheduled = state.activities.filter(a =>
      a.targetPeriod === "day" && isScheduledOn(a, date));
    let done = 0, partial = 0, total = 0;
    scheduled.forEach(a => {
      const snap = Storage.getActivitySnapshot(state, a.id, key) || a;
      const target = snap.targetValue || 1;
      const value = (state.dailyLog[key] || {})[a.id] || 0;
      total++;
      if (value >= target) done++;
      else if (value > 0) partial++;
    });
    const pct = total === 0 ? 0 : Math.round((done + partial * 0.5) / total * 100);
    return {
      scheduled, done, partial, total, pct,
      fastingEnds:   Storage.getFastingSessionsEndingOn(state, key),
      fastingStarts: Storage.getFastingSessionsStartingOn(state, key)
    };
  }

  function isScheduledOn(activity, date) {
    if (activity.paused) {
      const key = Storage.todayKey(date);
      return !!(state.dailyLog[key] && state.dailyLog[key][activity.id]);
    }
    if (activity.targetPeriod !== "day") return false;
    if (activity.schedule === "everyday") return true;
    return (activity.days || []).includes(date.getDay());
  }

  function renderDetail() {
    const parts = selectedKey.split("-").map(Number);
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    const todayK = Storage.todayKey();
    const isFuture = selectedKey > todayK;

    const w = els.detail;
    w.innerHTML = "";

    const head = document.createElement("div");
    head.className = "cal-detail-header";
    head.innerHTML = [
      '<span class="cal-detail-date">' + date.getDate() + ' ' +
        date.toLocaleDateString(undefined, { month: "long" }).toUpperCase() + '</span>',
      '<span class="cal-detail-weekday">' + date.toLocaleDateString(undefined, { weekday: "long" }) + '</span>'
    ].join("");
    w.appendChild(head);

    if (!isFuture) {
      const st = dayStatus(date);
      const comp = document.createElement("div");
      comp.className = "cal-completion";
      comp.innerHTML = [
        '<span class="cal-completion-label">Daily Completion</span>',
        '<span class="cal-completion-value">' + st.pct + '%</span>'
      ].join("");
      w.appendChild(comp);
    }

    if (isFuture) {
      const planned = state.activities.filter(a => !a.paused && isScheduledOn(a, date));
      if (planned.length) {
        w.appendChild(sectionTitle("Planned Activities"));
        planned.forEach(a => w.appendChild(renderActivityItem(a, null)));
      }
    } else {
      const scheduled = state.activities.filter(a => isScheduledOn(a, date));
      if (scheduled.length) {
        w.appendChild(sectionTitle("Activities"));
        scheduled.forEach(a => {
          const snap = Storage.getActivitySnapshot(state, a.id, selectedKey) || a;
          const v = (state.dailyLog[selectedKey] || {})[a.id] || 0;
          w.appendChild(renderActivityItem(snap, v, a.id));
        });
      }
    }

    const fastEnds   = Storage.getFastingSessionsEndingOn(state, selectedKey);
    const fastStarts = Storage.getFastingSessionsStartingOn(state, selectedKey);
    if (fastEnds.length || fastStarts.length) {
      w.appendChild(sectionTitle("Fasting"));
      fastEnds.forEach(s => w.appendChild(renderFastingItem(s, "ended")));
      fastStarts.forEach(s => w.appendChild(renderFastingItem(s, "started")));
    }

    w.appendChild(sectionTitle("To-Do", "+ Add Task", () => openAddTodoSheet(selectedKey)));
    const tasks = Todos.forDate(state, selectedKey);
    if (tasks.length) tasks.forEach(t => w.appendChild(renderTodoItem(t)));
    else {
      const empty = document.createElement("div");
      empty.className = "cal-empty";
      empty.textContent = "No tasks for this day.";
      w.appendChild(empty);
    }

    w.appendChild(sectionTitle("Notes", "+ Add Note", () => openAddNoteSheet(selectedKey)));
    const notes = Notes.forDate(state, selectedKey);
    if (notes.length) notes.forEach(n => w.appendChild(renderNoteItem(n)));
    else {
      const empty = document.createElement("div");
      empty.className = "cal-empty";
      empty.textContent = "No notes yet.";
      w.appendChild(empty);
    }
  }

  function sectionTitle(label, actionLabel, onAction) {
    const el = document.createElement("div");
    el.className = "cal-section-title";
    el.innerHTML = '<span>' + label + '</span>';
    if (actionLabel) {
      const btn = document.createElement("button");
      btn.className = "cal-section-add";
      btn.textContent = actionLabel;
      btn.addEventListener("click", onAction);
      el.appendChild(btn);
    }
    return el;
  }

  function renderActivityItem(a, value, activityId) {
    const target = a.targetValue || 1;
    const unit = a.targetUnit === "custom" ? (a.customUnit || "units") : a.targetUnit;
    const item = document.createElement("div");
    item.className = "cal-item";

    let cls = "none", label = "No activity", valText = target + ' ' + unit;
    if (value == null) { label = "Planned"; }
    else {
      valText = value + ' / ' + target + ' ' + escapeHtml(unit);
      if (value === 0) cls = "none", label = "No activity";
      else if (value >= target) cls = "done", label = "Completed";
      else cls = "partial", label = "Partial";
    }

    const hasEdit = !!activityId;

    item.innerHTML = [
      '<div class="cal-item-icon">' + escapeHtml(a.icon) + '</div>',
      '<div class="cal-item-meta">',
      '  <div class="cal-item-name">' + escapeHtml(a.name) + '</div>',
      '  <div class="cal-item-val">' + valText + '</div>',
      '</div>',
      '<span class="cal-item-status ' + cls + '">' + label + '</span>',
      (hasEdit ? '<button class="cal-item-options" aria-label="Edit">⋯</button>' : '')
    ].join("");

    if (hasEdit) {
      item.querySelector(".cal-item-options").addEventListener("click", (e) => {
        e.stopPropagation();
        openActivityRecordOptions(activityId, a.name);
      });
    }

    return item;
  }

  function openActivityRecordOptions(activityId, name) {
    Sheet.openOptions({
      title: name,
      items: [
        { icon: "✏️", label: "Edit Progress", onClick: () => openEditActivityProgress(activityId, name) }
      ]
    });
  }

  function openEditActivityProgress(activityId, name) {
    const dayLog = state.dailyLog[selectedKey] || {};
    const currentValue = dayLog[activityId] || 0;
    const activity = state.activities.find(a => a.id === activityId);
    const snap = Storage.getActivitySnapshot(state, activityId, selectedKey) || activity || {};
    const unit = snap.targetUnit === "custom" ? (snap.customUnit || "units") : (snap.targetUnit || "units");
    const target = snap.targetValue || 1;

    Sheet.open({
      title: "Edit Progress",
      body: [
        '<p class="confirm-text">',
        '  Activity: <strong>' + escapeHtml(snap.name || name) + '</strong><br>',
        '  Date: <strong>' + selectedKey + '</strong>',
        '</p>',
        '<label class="field">',
        '  <span>Progress (' + escapeHtml(unit) + ')</span>',
        '  <input id="ap-value" type="number" min="0" max="' + target + '" value="' + currentValue + '" step="1">',
        '</label>',
        '<div class="setup-summary">',
        '  <span class="setup-summary-label">Target</span>',
        '  <span class="setup-summary-value">' + target + ' ' + escapeHtml(unit) + '</span>',
        '</div>'
      ].join(""),
      actions: [
        { label: "Cancel", kind: "ghost" },
        { label: "Save", kind: "primary", onClick: () => {
          const v = Number(document.getElementById("ap-value").value);
          if (isNaN(v) || v < 0) { alert("Please enter a valid number."); return false; }
          const s = Storage.loadState();
          s.dailyLog[selectedKey] = s.dailyLog[selectedKey] || {};
          s.dailyLog[selectedKey][activityId] = Math.max(0, Math.min(target, v));
          Storage.saveState(s);
          Calendar.refresh();
        }}
      ]
    });
  }

  function renderFastingItem(s, role) {
    const startD = new Date(s.startTs);
    const endD = new Date(s.endTs);
    const hours = s.actualHours.toFixed(2).replace(/\.00$/, "");
    const badge = s.completed ? "done" : "partial";
    const label = s.completed ? "✓" : "Incomplete";

    const row = document.createElement("div");
    row.className = "cal-fasting-item";
    row.innerHTML = [
      '<div class="cal-fasting-head">',
      '  <span style="font-size:18px">⏳</span>',
      '  <span class="cal-fasting-plan">' + escapeHtml(s.plan) + '</span>',
      '  <span class="cal-fasting-badge ' + badge + '">' + label + '</span>',
      '  <button class="cal-item-options" aria-label="Edit">⋯</button>',
      '</div>',
      '<div class="cal-fasting-detail">',
      '  Start: ' + fmtShort(startD) + ' • ' + timeOf(startD) + '<br>',
      '  End:&nbsp;&nbsp; ' + fmtShort(endD) + ' • ' + timeOf(endD) + '<br>',
      '  ' + hours + 'h ' + (role === "started" ? "(started here, ended next day)" : ""),
      '</div>'
    ].join("");

    row.querySelector(".cal-item-options").addEventListener("click", (e) => {
      e.stopPropagation();
      openFastingRecordOptions(s.id);
    });

    return row;
  }

  function openFastingRecordOptions(sessionId) {
    Sheet.openOptions({
      title: "Fasting Record",
      items: [
        { icon: "✏️", label: "Edit Start / End", onClick: () => openEditFastingTimes(sessionId) },
        { icon: "🔄", label: "Toggle Complete Status", onClick: () => toggleFastingComplete(sessionId) },
        { icon: "🗑️", label: "Delete Record", kind: "danger", onClick: () => confirmDeleteFasting(sessionId) }
      ]
    });
  }

  function openEditFastingTimes(sessionId) {
    const s = state.fasting.sessions.find(x => x.id === sessionId);
    if (!s) return;
    const start = new Date(s.startTs);
    const end = new Date(s.endTs);

    Sheet.open({
      title: "Edit Fasting Record",
      body: [
        '<div class="setup-section-label">Start</div>',
        '<div class="setup-row">',
        '  <label class="field"><span>Date</span>',
        '    <input id="fe-start-date" type="date" value="' + toDateInputValue(start) + '">',
        '  </label>',
        '  <label class="field"><span>Time</span>',
        '    <input id="fe-start-time" type="time" value="' + toTimeInputValue(start) + '">',
        '  </label>',
        '</div>',
        '<div class="setup-section-label">End</div>',
        '<div class="setup-row">',
        '  <label class="field"><span>Date</span>',
        '    <input id="fe-end-date" type="date" value="' + toDateInputValue(end) + '">',
        '  </label>',
        '  <label class="field"><span>Time</span>',
        '    <input id="fe-end-time" type="time" value="' + toTimeInputValue(end) + '">',
        '  </label>',
        '</div>',
        '<div class="setup-error" id="fe-error" hidden></div>'
      ].join(""),
      actions: [
        { label: "Cancel", kind: "ghost" },
        { label: "Save", kind: "primary", onClick: () => {
          const newStart = buildTs(
            document.getElementById("fe-start-date").value,
            document.getElementById("fe-start-time").value
          );
          const newEnd = buildTs(
            document.getElementById("fe-end-date").value,
            document.getElementById("fe-end-time").value
          );
          if (newStart == null || newEnd == null || newEnd <= newStart) {
            const errEl = document.getElementById("fe-error");
            if (errEl) { errEl.hidden = false; errEl.textContent = "End time must be later than start time."; }
            return false;
          }
          const s2 = Storage.loadState();
          Fasting.updateSession(s2, sessionId, { startTs: newStart, endTs: newEnd });
          Calendar.refresh();
        }}
      ]
    });
  }

  function toggleFastingComplete(sessionId) {
    const s = Storage.loadState();
    const session = s.fasting.sessions.find(x => x.id === sessionId);
    if (!session) return;
    session.completed = !session.completed;
    Storage.saveState(s);
    Calendar.refresh();
  }

  function confirmDeleteFasting(sessionId) {
    Sheet.confirm({
      title: "Delete this fasting record?",
      message: "This will remove the fasting record permanently. This action cannot be undone.",
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      confirmKind: "danger",
      onConfirm: () => {
        const s = Storage.loadState();
        Fasting.deleteSession(s, sessionId);
        Calendar.refresh();
      }
    });
  }

  function renderTodoItem(t) {
    const row = document.createElement("div");
    row.className = "todo-item" + (t.completed ? " done" : "");
    const reminder = (state.reminders || []).find(r => r.type === "todo" && r.sourceId === t.id);
    const showBell = reminder && reminder.enabled;
    row.innerHTML = [
      '<button class="todo-check ' + (t.completed ? "done" : "") + '">' + (t.completed ? "✓" : "") + '</button>',
      '<div class="todo-body">',
      '  <div class="todo-title">' + escapeHtml(t.title) + '</div>',
      (t.description ? '<div class="todo-desc">' + escapeHtml(t.description) + '</div>' : ""),
      (t.time ? '<div class="todo-meta">🕒 ' + formatTaskTime(t.time) + (showBell ? " · 🔔" : "") + '</div>' : ""),
      '</div>',
      '<button class="todo-options">•••</button>'
    ].join("");
    row.querySelector(".todo-check").addEventListener("click", () => {
      const s = Storage.loadState();
      Todos.toggle(s, t.id);
      Calendar.refresh();
    });
    row.querySelector(".todo-options").addEventListener("click", () => openTodoOptions(t.id));
    return row;
  }

  function openTodoOptions(id) {
    Sheet.openOptions({
      title: "Task Options",
      items: [
        { icon: "✏️", label: "Edit", onClick: () => openEditTodoSheet(id) },
        { icon: "✅", label: "Toggle Complete", onClick: () => {
            const s = Storage.loadState(); Todos.toggle(s, id); Calendar.refresh();
          }},
        { icon: "🗑️", label: "Delete", kind: "danger", onClick: () => {
            const s = Storage.loadState(); Todos.remove(s, id); Calendar.refresh();
          }}
      ]
    });
  }

  function renderNoteItem(n) {
    const row = document.createElement("div");
    row.className = "note-item";
    row.innerHTML = [
      escapeHtml(n.text),
      '<div class="note-meta">',
      '  <span>' + new Date(n.updatedAt).toLocaleString(undefined,{day:"numeric",month:"short",hour:"numeric",minute:"2-digit"}) + '</span>',
      '  <span class="note-actions">',
      '    <button class="note-action" data-act="edit">✏️</button>',
      '    <button class="note-act" data-act="delete">🗑️</button>',
      '  </span>',
      '</div>'
    ].join("");
    row.querySelector('[data-act="edit"]').addEventListener("click", () => openEditNoteSheet(n.id));
    row.querySelector('[data-act="delete"]').addEventListener("click", () => {
      if (!confirm("Delete this note?")) return;
      const s = Storage.loadState();
      Notes.remove(s, n.id);
      Calendar.refresh();
    });
    return row;
  }

  function openAddTodoSheet(dateKey) { openTodoSheet(null, dateKey); }
  function openEditTodoSheet(id) { openTodoSheet(id, null); }

  function openTodoSheet(id, presetDate) {
    const existing = id ? state.todos.find(t => t.id === id) : null;
    const dateKey = existing ? existing.date : (presetDate || selectedKey);
    const title = existing ? "Edit Task" : "Add Task";

    const currentReminder = existing
      ? (state.reminders || []).find(r => r.type === "todo" && r.sourceId === existing.id)
      : null;
    const remEnabled = existing ? !!(currentReminder && currentReminder.enabled) : false;
    const remAdvance = currentReminder ? (currentReminder.advanceMinutes || 0) : 0;

    Sheet.open({
      title: title,
      body: [
        '<label class="field"><span>Title</span>',
        '  <input id="t-title" type="text" placeholder="e.g. Create Shopee Video" value="' + (existing ? escapeAttr(existing.title) : "") + '">',
        '</label>',
        '<label class="field"><span>Description (optional)</span>',
        '  <textarea id="t-desc" placeholder="Details…">' + (existing ? escapeAttr(existing.description || "") : "") + '</textarea>',
        '</label>',
        '<div class="field-row">',
        '  <label class="field"><span>Date</span>',
        '    <input id="t-date" type="date" value="' + (existing ? existing.date : dateKey) + '">',
        '  </label>',
        '  <label class="field"><span>Time (optional)</span>',
        '    <input id="t-time" type="time" value="' + (existing ? existing.time || "" : "") + '">',
        '  </label>',
        '</div>',
        '<div class="setting-row" style="margin-top:6px">',
        '  <div class="setting-row-label"><span>Reminder</span><span>Notify before task time</span></div>',
        '  <label class="switch"><input id="t-rem-enabled" type="checkbox"' + (remEnabled ? " checked" : "") + '>',
        '    <span class="switch-track"><span class="switch-thumb"></span></span>',
        '  </label>',
        '</div>',
        '<label class="field" id="t-rem-advance-wrap" style="' + (remEnabled ? "" : "display:none") + '">',
        '  <span>Notify before</span>',
        '  <select id="t-rem-advance">',
        '    <option value="0"' + (remAdvance === 0 ? " selected" : "") + '>At scheduled time</option>',
        '    <option value="5"' + (remAdvance === 5 ? " selected" : "") + '>5 minutes before</option>',
        '    <option value="15"' + (remAdvance === 15 ? " selected" : "") + '>15 minutes before</option>',
        '    <option value="30"' + (remAdvance === 30 ? " selected" : "") + '>30 minutes before</option>',
        '    <option value="60"' + (remAdvance === 60 ? " selected" : "") + '>1 hour before</option>',
        '    <option value="1440"' + (remAdvance === 1440 ? " selected" : "") + '>1 day before</option>',
        '  </select>',
        '</label>'
      ].join(""),
      actions: [
        { label: "Cancel", kind: "ghost" },
        { label: existing ? "Save" : "Add Task", kind: "primary", onClick: () => {
          const titleV = document.getElementById("t-title").value.trim();
          const descV  = document.getElementById("t-desc").value.trim();
          const dateV  = document.getElementById("t-date").value;
          const timeV  = document.getElementById("t-time").value;
          const remOn  = document.getElementById("t-rem-enabled").checked;
          const remAdv = Number(document.getElementById("t-rem-advance").value || 0);

          if (!titleV) { alert("Please enter a title."); return false; }
          if (!dateV)  { alert("Please choose a date."); return false; }
          if (remOn && !timeV) { alert("Reminder requires a task time."); return false; }

          const s = Storage.loadState();
          let todo;
          if (existing) {
            todo = Todos.update(s, existing.id, {
              title: titleV, description: descV, date: dateV, time: timeV
            });
          } else {
            todo = Todos.create(s, {
              title: titleV, description: descV, date: dateV, time: timeV
            });
          }
          if (window.Reminders && typeof Reminders.upsertForTodo === "function") {
            if (remOn && timeV) {
              Reminders.upsertForTodo(s, todo.id, {
                enabled: true, date: dateV, time: timeV, days: [], advanceMinutes: remAdv
              });
            } else {
              Reminders.removeForSource(s, todo.id);
            }
          }
          Calendar.refresh();
        }}
      ]
    });

    setTimeout(() => {
      const cb = document.getElementById("t-rem-enabled");
      const wrap = document.getElementById("t-rem-advance-wrap");
      if (cb && wrap) {
        cb.addEventListener("change", () => {
          wrap.style.display = cb.checked ? "" : "none";
        });
      }
    }, 0);
  }

  function openAddNoteSheet(dateKey) { openNoteSheet(null, dateKey); }
  function openEditNoteSheet(id) { openNoteSheet(id, null); }

  function openNoteSheet(id, presetDate) {
    const existing = id ? state.notes.find(n => n.id === id) : null;
    const dateKey = existing ? existing.date : (presetDate || selectedKey);
    const title = existing ? "Edit Note" : "Add Note";

    Sheet.open({
      title: title,
      body: [
        '<label class="field"><span>Note</span>',
        '  <textarea id="n-text" placeholder="Write anything…">' + (existing ? escapeAttr(existing.text) : "") + '</textarea>',
        '</label>',
        '<label class="field"><span>Date</span>',
        '  <input id="n-date" type="date" value="' + (existing ? existing.date : dateKey) + '">',
        '</label>'
      ].join(""),
      actions: [
        { label: "Cancel", kind: "ghost" },
        { label: existing ? "Save" : "Add Note", kind: "primary", onClick: () => {
          const text = document.getElementById("n-text").value.trim();
          const dateV = document.getElementById("n-date").value;
          if (!text) { alert("Please enter some text."); return false; }
          if (!dateV) { alert("Please choose a date."); return false; }
          const s = Storage.loadState();
          if (existing) Notes.update(s, existing.id, text);
          else Notes.create(s, { date: dateV, text });
          Calendar.refresh();
        }}
      ]
    });
  }

  function toDateInputValue(d) {
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, "0") + '-' +
      String(d.getDate()).padStart(2, "0");
  }
  function toTimeInputValue(d) {
    return String(d.getHours()).padStart(2, "0") + ':' +
           String(d.getMinutes()).padStart(2, "0");
  }
  function buildTs(dateStr, timeStr) {
    if (!dateStr || !timeStr) return null;
    const dd = dateStr.split("-").map(Number);
    const tt = timeStr.split(":").map(Number);
    return new Date(dd[0], dd[1] - 1, dd[2], tt[0], tt[1], 0, 0).getTime();
  }
  function fmtShort(d) { return d.toLocaleDateString(undefined, { day: "numeric", month: "short" }); }
  function timeOf(d) { return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); }
  function formatTaskTime(hhmm) {
    if (!hhmm) return "";
    const parts = hhmm.split(":").map(Number);
    return new Date(2000, 0, 1, parts[0], parts[1]).toLocaleTimeString(undefined, {
      hour: "numeric", minute: "2-digit"
    });
  }
  function escapeHtml(str) {
    return String(str || "").replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }
  function escapeAttr(str) {
    return escapeHtml(str).replace(/\n/g, "&#10;");
  }

  return { init, refresh, jumpToToday };
})();

window.Calendar = Calendar;  /* expose for window.Calendar checks in other modules */
