/* =========================================================
   notifications.js — In-app Notification Adapter (Phase 5, patched)
   -----------------------------------------------------------------
   FIXES:
   - Delivery works even if host div missing (fallback to body).
   - Snooze button calls Reminders.snooze for real reminders.
   - Robust escaping and id-based dedupe.
   ========================================================= */

const NotificationAdapter = (() => {

  const MAX_QUEUE = 5;
  const queue = [];
  let showing = false;

  /* ---------- Public ---------- */
  function deliver(payload) {
    if (!payload || !payload.id) return;
    if (queue.some(p => p.id === payload.id)) return;
    if (showing && current && current.id === payload.id) return;

    queue.push(payload);
    while (queue.length > MAX_QUEUE) queue.shift();
    processQueue();
  }

  let current = null;

  function processQueue() {
    if (showing) return;
    if (!queue.length) return;
    current = queue.shift();
    showing = true;
    show(current);
  }

  function show(payload) {
    const host = getHost();
    host.innerHTML = "";

    const backdrop = document.createElement("div");
    backdrop.className = "notif-backdrop";

    const actionsHTML = (payload.actions || []).map((a, i) =>
      `<button class="btn ${
        a.kind === "primary" ? "btn-primary" :
        a.kind === "danger"  ? "btn-danger"  :
        "btn-ghost"
      }" data-action-idx="${i}">${escapeHtml(a.label)}</button>`
    ).join("");

    backdrop.innerHTML = `
      <div class="notif-card">
        <div class="notif-head">
          <div class="notif-icon">${escapeHtml(payload.icon || "🔔")}</div>
          <div class="notif-titles">
            <div class="notif-eyebrow">${escapeHtml(payload.eyebrow || "REMINDER")}</div>
            <div class="notif-title">${escapeHtml(payload.title || "")}</div>
          </div>
        </div>
        <div class="notif-text">${escapeHtml(payload.text || "")}</div>
        <div class="notif-actions">${actionsHTML || '<button class="btn btn-ghost" data-close>OK</button>'}</div>
        <div class="notif-snooze">
          <button class="notif-snooze-btn" data-snooze="5">+5 min</button>
          <button class="notif-snooze-btn" data-snooze="10">+10 min</button>
          <button class="notif-snooze-btn" data-snooze="30">+30 min</button>
          <button class="notif-snooze-btn" data-snooze="60">+1 hr</button>
        </div>
      </div>
    `;

    host.appendChild(backdrop);

    /* Actions */
    backdrop.querySelectorAll("[data-action-idx]").forEach(btn => {
      const idx = Number(btn.dataset.actionIdx);
      const action = (payload.actions || [])[idx];
      btn.addEventListener("click", () => {
        close();
        if (action && typeof action.onClick === "function") action.onClick();
      });
    });

    backdrop.querySelectorAll("[data-close]").forEach(b =>
      b.addEventListener("click", close));

    /* Snooze */
    backdrop.querySelectorAll("[data-snooze]").forEach(btn => {
      btn.addEventListener("click", () => {
        const minutes = Number(btn.dataset.snooze);
        snoozePayload(payload, minutes);
        close();
      });
    });

    /* Backdrop click = snooze default 10 min */
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) {
        snoozePayload(payload, 10);
        close();
      }
    });
  }

  function snoozePayload(payload, minutes) {
    if (typeof Reminders === "undefined") return;
    /* Only "rm-*" reminders can be snoozed via Reminders.snooze.
       Fasting/weekly dynamic ones just get re-fired after snooze period. */
    if (payload.id && payload.id.startsWith("rm-")) {
      const state = Storage.loadState();
      Reminders.snooze(state, payload.id, minutes);
      return;
    }
    /* Dynamic reminders — clear fired cache to allow re-firing later */
    if (payload.id) {
      try {
        const KEY = "routineFast.v1.fired";
        const cache = JSON.parse(localStorage.getItem(KEY) || "{}");
        delete cache[payload.id];
        localStorage.setItem(KEY, JSON.stringify(cache));
      } catch {}
    }
  }

  function close() {
    const host = getHost();
    if (host) host.innerHTML = "";
    showing = false;
    current = null;
    if (queue.length) setTimeout(processQueue, 260);
  }

  function getHost() {
    let host = document.getElementById("notification-host");
    if (!host) {
      host = document.createElement("div");
      host.id = "notification-host";
      document.body.appendChild(host);
    }
    return host;
  }

  function escapeHtml(str = "") {
    return String(str).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  return { deliver, close };
})();

window.NotificationAdapter = NotificationAdapter;