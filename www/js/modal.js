/* =========================================================
   modal.js — Add/Edit Activity bottom sheet.
   ========================================================= */

const ActivityModal = (() => {

  let root, form, titleEl, deleteBtn, pauseBtn, onSaved, editingId;

  const ICONS = ["🚶","🏃","🏋️","🧘","📖","📚","🕌","💧","🛍️","💻",
                 "✍️","🧹","🍎","😴","🎯","⏱️","🎨","🎵","🌱","⭐"];

  function open(state, activityOrNull, cb) {
    ensureMounted();
    editingId = activityOrNull ? activityOrNull.id : null;
    onSaved   = cb;
    titleEl.textContent = editingId ? "Edit Activity" : "Add Activity";
    fillForm(activityOrNull || defaultActivity());

    deleteBtn.style.display = editingId ? "inline-flex" : "none";
    pauseBtn.style.display  = editingId ? "inline-flex" : "none";

    if (editingId && activityOrNull) {
      const a = Activities.getById(state, editingId);
      pauseBtn.textContent = a && a.paused ? "Reactivate" : "Pause";
    }

    root.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function close() {
    if (!root) return;
    root.classList.remove("open");
    document.body.style.overflow = "";
  }

  function ensureMounted() {
    if (root) return;

    root = document.createElement("div");
    root.className = "modal-root";
    root.innerHTML = `
      <div class="modal-backdrop" data-close></div>
      <div class="modal-sheet" role="dialog" aria-modal="true">
        <div class="modal-handle"></div>
        <h2 class="modal-title">Add Activity</h2>
        <form class="modal-form" novalidate>

          <label class="field">
            <span>Activity name</span>
            <input name="name" type="text" placeholder="e.g. Reading Quran" required>
          </label>

          <div class="field">
            <span>Icon</span>
            <div class="icon-picker" data-icon-picker></div>
            <input name="icon" type="hidden" value="⭐">
          </div>

          <label class="field">
            <span>Tracking type</span>
            <select name="trackingType">
              <option value="duration">Duration</option>
              <option value="counter">Counter</option>
              <option value="checklist">Checklist</option>
            </select>
          </label>

          <div class="field-row">
            <label class="field">
              <span>Target</span>
              <input name="targetValue" type="number" min="1" value="30">
            </label>
            <label class="field">
              <span>Unit</span>
              <select name="targetUnit">
                <option>minutes</option><option>hours</option>
                <option>times</option><option>sessions</option>
                <option>pages</option><option>items</option>
                <option value="custom">custom…</option>
              </select>
            </label>
          </div>

          <label class="field" data-custom-unit hidden>
            <span>Custom unit</span>
            <input name="customUnit" type="text" placeholder="e.g. glasses">
          </label>

          <label class="field">
            <span>Period</span>
            <select name="targetPeriod">
              <option value="day">Per Day</option>
              <option value="week">Per Week</option>
              <option value="month">Per Month</option>
              <option value="year">Per Year</option>
            </select>
          </label>

          <label class="field">
            <span>Schedule</span>
            <select name="schedule">
              <option value="everyday">Every Day</option>
              <option value="selectedDays">Selected Days</option>
            </select>
          </label>

          <div class="field" data-days hidden>
            <span>Days</span>
            <div class="day-picker" data-day-picker></div>
          </div>

          <div class="field field--inline">
            <span>Reminder</span>
            <label class="switch">
              <input name="reminderEnabled" type="checkbox">
              <span class="switch-track"><span class="switch-thumb"></span></span>
            </label>
          </div>

          <label class="field" data-reminder-time hidden>
            <span>Reminder time</span>
            <input name="reminderTime" type="time" value="09:00">
          </label>

          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" data-close>Cancel</button>
            <button type="button" class="btn btn-ghost" data-pause style="display:none">Pause</button>
            <button type="button" class="btn btn-danger" data-delete style="display:none">Delete</button>
            <button type="submit" class="btn btn-primary">Save</button>
          </div>
        </form>
      </div>
    `;

    document.getElementById("modal-host").appendChild(root);

    form      = root.querySelector(".modal-form");
    titleEl   = root.querySelector(".modal-title");
    deleteBtn = root.querySelector("[data-delete]");
    pauseBtn  = root.querySelector("[data-pause]");

    /* icon picker */
    const ip = root.querySelector("[data-icon-picker]");
    const ih = root.querySelector('input[name="icon"]');
    ICONS.forEach(ic => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "icon-pick";
      b.textContent = ic;
      b.addEventListener("click", () => {
        ih.value = ic;
        ip.querySelectorAll(".icon-pick").forEach(x =>
          x.classList.toggle("active", x === b));
      });
      ip.appendChild(b);
    });

    /* day picker */
    const dp = root.querySelector("[data-day-picker]");
    ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].forEach((lbl, idx) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "day-pick";
      b.dataset.day = idx;
      b.textContent = lbl;
      b.addEventListener("click", () => b.classList.toggle("active"));
      dp.appendChild(b);
    });

    /* conditionals */
    const trackingSel = form.querySelector('[name="trackingType"]');
    const unitSel     = form.querySelector('[name="targetUnit"]');
    const scheduleSel = form.querySelector('[name="schedule"]');
    const remChk      = form.querySelector('[name="reminderEnabled"]');

    function updateConditionals() {
      root.querySelector("[data-custom-unit]").hidden   = unitSel.value !== "custom";
      root.querySelector("[data-days]").hidden          = scheduleSel.value !== "selectedDays";
      root.querySelector("[data-reminder-time]").hidden = !remChk.checked;
    }

    trackingSel.addEventListener("change", updateConditionals);
    unitSel    .addEventListener("change", updateConditionals);
    scheduleSel.addEventListener("change", updateConditionals);
    remChk     .addEventListener("change", updateConditionals);

    root.querySelectorAll("[data-close]").forEach(el =>
      el.addEventListener("click", close));

    pauseBtn.addEventListener("click", () => {
      if (!editingId) return;
      const state = Storage.loadState();
      const a = Activities.getById(state, editingId);
      Activities.pauseActivity(state, editingId, !(a && a.paused));
      close();
      onSaved && onSaved();
    });

    deleteBtn.addEventListener("click", () => {
      if (!editingId) return;
      if (!confirm("Delete this activity? Past progress history will remain.")) return;
      const state = Storage.loadState();
      Activities.deleteActivity(state, editingId);
      close();
      onSaved && onSaved();
    });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const data = readForm();
      if (!data.name.trim()) { alert("Please enter an activity name."); return; }

      const state = Storage.loadState();
      if (editingId) Activities.updateActivity(state, editingId, data);
      else           Activities.createActivity(state, data);

      close();
      onSaved && onSaved();
    });
  }

  function defaultActivity() {
    return {
      name: "", icon: "⭐", trackingType: "duration",
      targetValue: 30, targetUnit: "minutes", customUnit: "",
      targetPeriod: "day", schedule: "everyday", days: [],
      reminder: { enabled: false, time: "09:00" }
    };
  }

  function fillForm(a) {
    form.name.value         = a.name;
    form.icon.value         = a.icon;
    form.trackingType.value = a.trackingType;
    form.targetValue.value  = a.targetValue;
    form.targetUnit.value   = a.targetUnit;
    form.customUnit.value   = a.customUnit || "";
    form.targetPeriod.value = a.targetPeriod;
    form.schedule.value     = a.schedule;
    form.reminderEnabled.checked = !!(a.reminder && a.reminder.enabled);
    form.reminderTime.value = (a.reminder && a.reminder.time) || "09:00";

    form.querySelectorAll(".icon-pick").forEach(b =>
      b.classList.toggle("active", b.textContent === a.icon));
    form.querySelectorAll(".day-pick").forEach(b =>
      b.classList.toggle("active", (a.days || []).includes(Number(b.dataset.day))));

    form.querySelector("[data-custom-unit]").hidden   = a.targetUnit !== "custom";
    form.querySelector("[data-days]").hidden          = a.schedule !== "selectedDays";
    form.querySelector("[data-reminder-time]").hidden = !a.reminder.enabled;
  }

  function readForm() {
    const days = [...form.querySelectorAll(".day-pick.active")]
      .map(b => Number(b.dataset.day));

    return {
      name:         form.name.value.trim(),
      icon:         form.icon.value || "⭐",
      trackingType: form.trackingType.value,
      targetValue:  Number(form.targetValue.value) || 1,
      targetUnit:   form.targetUnit.value,
      customUnit:   form.customUnit.value.trim(),
      targetPeriod: form.targetPeriod.value,
      schedule:     form.schedule.value,
      days,
      reminder: {
        enabled: !!form.reminderEnabled.checked,
        time:    form.reminderTime.value || "09:00"
      }
    };
  }

  return { open, close };
})();

window.ActivityModal = ActivityModal;  /* expose for window.ActivityModal checks in other modules */
