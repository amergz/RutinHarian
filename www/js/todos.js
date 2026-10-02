/* =========================================================
   todos.js — To-Do CRUD (Phase 3, reminder-aware)
   ========================================================= */

const Todos = (() => {

  function create(state, data) {
    const now = Date.now();
    const todo = {
      id:          Storage.uid(),
      title:       (data.title || "Untitled").trim(),
      description: data.description || "",
      date:        data.date || Storage.todayKey(),
      time:        data.time || "",
      completed:   false,
      completedAt: null,
      createdAt:   now,
      updatedAt:   now
    };
    state.todos.push(todo);
    Storage.saveState(state);
    return todo;
  }

  function update(state, id, patch) {
    const idx = state.todos.findIndex(t => t.id === id);
    if (idx < 0) return null;
    state.todos[idx] = { ...state.todos[idx], ...patch, updatedAt: Date.now() };
    Storage.saveState(state);
    return state.todos[idx];
  }

  function remove(state, id) {
    state.todos = state.todos.filter(t => t.id !== id);
    /* Also remove any reminder linked to this To-Do */
    if (window.Reminders) {
      Reminders.removeForSource(state, id);
    }
    Storage.saveState(state);
  }

  function toggle(state, id) {
    const idx = state.todos.findIndex(t => t.id === id);
    if (idx < 0) return null;
    const t = state.todos[idx];
    const next = !t.completed;
    state.todos[idx] = {
      ...t,
      completed: next,
      completedAt: next ? Date.now() : null,
      updatedAt: Date.now()
    };

    /* When completed, disable its reminder */
    if (next && window.Reminders) {
      const r = (state.reminders || []).find(x => x.type === "todo" && x.sourceId === id);
      if (r) r.enabled = false;
    }
    Storage.saveState(state);
    return state.todos[idx];
  }

  function forDate(state, dateKey) {
    return state.todos
      .filter(t => t.date === dateKey)
      .sort((a, b) => {
        if (!!a.completed !== !!b.completed) return a.completed ? 1 : -1;
        if (a.time && b.time) return a.time.localeCompare(b.time);
        if (a.time) return -1;
        if (b.time) return 1;
        return a.createdAt - b.createdAt;
      });
  }

  function countForDate(state, dateKey) {
    const list = state.todos.filter(t => t.date === dateKey);
    if (!list.length) return null;
    const done = list.filter(t => t.completed).length;
    return { total: list.length, done };
  }

  function hasTasksOn(state, dateKey) {
    return state.todos.some(t => t.date === dateKey);
  }

  function between(state, fromKey, toKey) {
    return state.todos.filter(t => t.date >= fromKey && t.date <= toKey);
  }

  return { create, update, remove, toggle, forDate, countForDate, hasTasksOn, between };
})();