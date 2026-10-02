/* =========================================================
   backup.js — Export / Import / Reset (Phase 5).
   Uses Storage.exportBackup() and Storage.importBackup().
   All destructive actions require confirmation.
   ========================================================= */

const Backup = (() => {

  /* =========================================================
     Export
     ========================================================= */
  function exportNow() {
    try {
      const json = Storage.exportBackup();
      const blob = new Blob([json], { type: "application/json" });

      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      const filename = `routine-fast-backup-${stamp}.json`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 500);

      toast("Backup downloaded");
    } catch (e) {
      console.error("[backup] export failed:", e);
      alert("Failed to export data.\n" + (e.message || e));
    }
  }

  /* =========================================================
     Import
     ========================================================= */
  function openImportDialog() {
    /* Hidden file input created on the fly */
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.style.display = "none";
    document.body.appendChild(input);

    input.addEventListener("change", () => {
      const file = input.files && input.files[0];
      document.body.removeChild(input);
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        try {
          const text = String(reader.result || "");
          const parsed = JSON.parse(text);

          /* Validate before showing confirmation */
          validateBackup(parsed);

          confirmImport(parsed);
        } catch (e) {
          console.error("[backup] import validation failed:", e);
          alert("Invalid backup file.\n" + (e.message || e));
        }
      };
      reader.onerror = () => alert("Could not read the file.");
      reader.readAsText(file);
    });

    input.click();
  }

  function validateBackup(parsed) {
    if (!parsed || typeof parsed !== "object")         throw new Error("Not a JSON object");
    if (parsed.app !== "RoutineFast")                  throw new Error("Missing app identifier");
    if (!parsed.state || typeof parsed.state !== "object")
                                                       throw new Error("Missing state");
    const s = parsed.state;
    if (!Array.isArray(s.activities))                  throw new Error("Missing activities array");
    if (typeof s.version !== "number")                 throw new Error("Missing schema version");
  }

  function confirmImport(parsed) {
    Sheet.confirm({
      title: "Import Backup?",
      message: `
        <strong>Current local data will be replaced.</strong><br><br>
        Backup from: <strong>${escapeHtml(parsed.exportedAt || "unknown")}</strong><br>
        Schema version: <strong>${parsed.state.version}</strong><br><br>
        This will overwrite your activities, history, fasting sessions, tasks,
        notes, achievements, XP and settings.
      `,
      confirmLabel: "Import",
      cancelLabel: "Cancel",
      confirmKind: "danger",
      onConfirm: () => {
        try {
          Storage.importBackup(parsed);
          /* Reboot app state */
          if (window.App && App.refreshAll) App.refreshAll();
          if (window.Profile) Profile.refresh();
          if (window.Progress) Progress.refresh();
          if (window.Calendar) Calendar.refresh(Storage.loadState());
          toast("Backup imported");
        } catch (e) {
          console.error("[backup] import failed:", e);
          alert("Import failed.\n" + (e.message || e));
        }
      }
    });
  }

  /* =========================================================
     Reset
     ========================================================= */
  function openResetDialog() {
    Sheet.confirm({
      title: "Reset All Data?",
      message: `
        This will permanently remove your:<br><br>
        • Activities and history<br>
        • Fasting sessions<br>
        • To-Dos<br>
        • Notes<br>
        • Achievements and XP<br>
        • Settings and reminders<br><br>
        <strong>This cannot be undone.</strong>
      `,
      confirmLabel: "Continue",
      cancelLabel: "Cancel",
      confirmKind: "danger",
      onConfirm: () => {
        /* Second confirmation */
        setTimeout(() => {
          Sheet.confirm({
            title: "Are you absolutely sure?",
            message: `Type-free final confirmation. All local data will be erased.`,
            confirmLabel: "Erase Everything",
            cancelLabel: "Keep My Data",
            confirmKind: "danger",
            onConfirm: () => {
              try {
                Storage.resetState();
                /* Also clear fired-reminder cache */
                try { localStorage.removeItem("routineFast.v1.fired"); } catch {}

                if (window.App && App.refreshAll) App.refreshAll();
                if (window.Profile) Profile.refresh();
                if (window.Progress) Progress.refresh();
                if (window.Calendar) Calendar.refresh(Storage.loadState());
                toast("All data erased");
              } catch (e) {
                console.error("[backup] reset failed:", e);
                alert("Reset failed.\n" + (e.message || e));
              }
            }
          });
        }, 220);
      }
    });
  }

  /* =========================================================
     Toast (small confirmation message)
     ========================================================= */
  let toastTimer = null;
  function toast(message) {
    let host = document.getElementById("toast-host");
    if (!host) {
      host = document.createElement("div");
      host.id = "toast-host";
      host.style.cssText = `
        position: fixed; left: 50%; bottom: 88px;
        transform: translateX(-50%) translateY(20px);
        background: rgba(20,26,38,.96);
        color: var(--text);
        padding: 10px 16px;
        border-radius: 999px;
        border: 1px solid var(--border-2);
        font-size: 13px; font-weight: 700;
        box-shadow: 0 10px 30px rgba(0,0,0,.4);
        opacity: 0;
        transition: opacity .2s, transform .2s;
        z-index: 500;
        pointer-events: none;
        max-width: 80vw;
        text-align: center;
      `;
      document.body.appendChild(host);
    }
    host.textContent = message;
    requestAnimationFrame(() => {
      host.style.opacity = "1";
      host.style.transform = "translateX(-50%) translateY(0)";
    });

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      host.style.opacity = "0";
      host.style.transform = "translateX(-50%) translateY(20px)";
    }, 2400);
  }

  /* =========================================================
     Utils
     ========================================================= */
  function escapeHtml(str = "") {
    return String(str).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  return {
    exportNow,
    openImportDialog,
    openResetDialog,
    toast
  };
})();

window.Backup = Backup;  /* expose for window.Backup checks in other modules */
