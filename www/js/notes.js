/* =========================================================
   notes.js — Notes CRUD (Phase 3).
   Multiple notes per date supported.
   ========================================================= */

const Notes = (() => {

  function create(state, data) {
    const now = Date.now();
    const note = {
      id:        Storage.uid(),
      date:      data.date || Storage.todayKey(),
      text:      (data.text || "").trim(),
      createdAt: now,
      updatedAt: now
    };
    state.notes.push(note);
    Storage.saveState(state);
    return note;
  }

  function update(state, id, text) {
    const idx = state.notes.findIndex(n => n.id === id);
    if (idx < 0) return null;
    state.notes[idx] = {
      ...state.notes[idx],
      text: (text || "").trim(),
      updatedAt: Date.now()
    };
    Storage.saveState(state);
    return state.notes[idx];
  }

  function remove(state, id) {
    state.notes = state.notes.filter(n => n.id !== id);
    Storage.saveState(state);
  }

  function forDate(state, dateKey) {
    return state.notes
      .filter(n => n.date === dateKey)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  function hasNotesOn(state, dateKey) {
    return state.notes.some(n => n.date === dateKey);
  }

  function countForDate(state, dateKey) {
    return state.notes.filter(n => n.date === dateKey).length;
  }

  return { create, update, remove, forDate, hasNotesOn, countForDate };
})();