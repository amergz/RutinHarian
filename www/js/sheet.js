/* =========================================================
   sheet.js — generic bottom-sheet renderer.
   Used for options menus, confirmations, edit fast,
   edit todo, notes, and progress detail popups.
   ========================================================= */

const Sheet = (() => {

  function getHost() {
    return document.getElementById("sheet-host");
  }

  /**
   * open({ title, body, actions })
   *   - title:   string (shown at top)
   *   - body:    HTML string inserted into the card
   *   - actions: [{ label, kind:'ghost'|'primary'|'danger', onClick }]
   *     If onClick returns false, the sheet stays open.
   * Returns { close, root }.
   */
  function open({ title, body = "", actions = [] }) {
    const host = getHost();
    host.innerHTML = "";

    const backdrop = document.createElement("div");
    backdrop.className = "achv-backdrop";
    backdrop.innerHTML = `
      <div class="confirm-card" style="max-width:420px">
        <div class="confirm-title">${title || ""}</div>
        <div data-body></div>
        <div class="confirm-actions" data-actions style="margin-top:16px"></div>
      </div>
    `;
    host.appendChild(backdrop);

    const bodyEl    = backdrop.querySelector("[data-body]");
    const actionsEl = backdrop.querySelector("[data-actions]");
    bodyEl.innerHTML = body;

    actions.forEach(a => {
      const btn = document.createElement("button");
      btn.className = "btn " + (
        a.kind === "danger"  ? "btn-danger"  :
        a.kind === "primary" ? "btn-primary" :
        "btn-ghost"
      );
      btn.textContent = a.label;
      btn.addEventListener("click", () => {
        const r = a.onClick && a.onClick();
        if (r !== false) close();
      });
      actionsEl.appendChild(btn);
    });

    function close() { host.innerHTML = ""; }

    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) close();
    });

    return { close, root: backdrop };
  }

  /**
   * openOptions({ title, items })
   * items: [{ icon, label, kind, onClick }]
   */
  function openOptions({ title, items = [] }) {
    const host = getHost();
    host.innerHTML = "";

    const backdrop = document.createElement("div");
    backdrop.className = "achv-backdrop";
    backdrop.innerHTML = `
      <div class="confirm-card" style="max-width:420px">
        <div class="confirm-title">${title || ""}</div>
        <div class="option-list" data-list></div>
        <div class="confirm-actions">
          <button class="btn btn-ghost" data-cancel>Cancel</button>
        </div>
      </div>
    `;
    host.appendChild(backdrop);

    const list = backdrop.querySelector("[data-list]");

    items.forEach(it => {
      const btn = document.createElement("button");
      btn.className = "option-item" + (it.kind === "danger" ? " danger" : "");
      btn.innerHTML = `
        <span class="opt-icon">${it.icon || ""}</span>
        <span>${it.label}</span>
      `;
      btn.addEventListener("click", () => {
        close();
        it.onClick && it.onClick();
      });
      list.appendChild(btn);
    });

    function close() { host.innerHTML = ""; }

    backdrop.querySelector("[data-cancel]").addEventListener("click", close);
    backdrop.addEventListener("click", e => {
      if (e.target === backdrop) close();
    });

    return { close };
  }

  /**
   * confirm({ title, message, confirmLabel, cancelLabel, onConfirm })
   * Simple confirmation dialog.
   */
  function confirm({
    title = "Are you sure?",
    message = "",
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    confirmKind = "primary",
    onConfirm
  }) {
    return open({
      title,
      body: `<p class="confirm-text">${message}</p>`,
      actions: [
        { label: cancelLabel, kind: "ghost" },
        {
          label: confirmLabel,
          kind: confirmKind,
          onClick: () => { onConfirm && onConfirm(); }
        }
      ]
    });
  }

  return { open, openOptions, confirm };
})();