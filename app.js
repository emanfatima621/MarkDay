(() => {
  "use strict";
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const STORAGE_KEY = "daymark.tasks.v1";
  const CATEGORY_KEY = "daymark.categories.v1";
  const THEME_KEY = "daymark.theme.v1";
  const defaultCategories = ["Personal", "Study", "Work", "Errands"];
  const colors = ["#1DBF73", "#6688D8", "#D9A441", "#A17BC5", "#E07D68", "#4FA6B5"];
  const todayISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  };
  const makeId = () => (crypto && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  let tasks = readJSON(STORAGE_KEY, []);
  let categories = readJSON(CATEGORY_KEY, defaultCategories);
  let currentView = "all";
  let currentCategory = "";
  let currentFilter = "all";
  let editingId = null;
  let pendingDeleteId = null;
  let toastTimer = null;

  function readJSON(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value ?? fallback;
    } catch { return fallback; }
  }
  function saveTasks() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); return true; }
    catch { showToast("Could not save. Your browser storage may be full or disabled.", "error"); return false; }
  }
  function saveCategories() {
    try { localStorage.setItem(CATEGORY_KEY, JSON.stringify(categories)); return true; }
    catch { showToast("Could not save categories in this browser.", "error"); return false; }
  }
  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch]));
  }
  function isOverdue(task) { return !!task.dueDate && task.dueDate < todayISO() && !task.completed; }
  function formatDate(iso) {
    if (!iso) return "";
    const date = new Date(`${iso}T12:00:00`);
    return date.toLocaleDateString(undefined, { month:"short", day:"numeric" });
  }
  function dueLabel(task) {
    if (!task.dueDate) return "";
    if (task.dueDate < todayISO() && !task.completed) return "Overdue · " + formatDate(task.dueDate);
    if (task.dueDate === todayISO()) return "Today";
    return formatDate(task.dueDate);
  }
  function showToast(message, type = "success") {
    const region = $("#toastRegion");
    region.replaceChildren();
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;
    region.append(toast);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.remove(), 3200);
  }
  function updateDate() {
    $("#dateLabel").textContent = new Date().toLocaleDateString(undefined, { weekday:"long", month:"long", day:"numeric" }).toUpperCase();
  }
  function viewInfo() {
    const map = {
      all: ["My Tasks", "A clear plan makes room for good work.", "Your task list", "The things you want to move forward."],
      today: ["Today", "One day, one step at a time.", "Today's tasks", "What you have planned for today."],
      upcoming: ["Upcoming", "See what's coming up next.", "Coming up", "Tasks scheduled for a future date."],
      completed: ["Completed", "Look how far you've come.", "Completed tasks", "Everything you've checked off."]
    };
    if (currentCategory) return [currentCategory, `Your tasks filed under ${currentCategory}.`, `${currentCategory} tasks`, "A little progress adds up."];
    return map[currentView] || map.all;
  }
  function visibleTasks() {
    const query = $("#searchInput").value.trim().toLowerCase();
    let list = tasks.filter(task => {
      if (currentCategory && task.category !== currentCategory) return false;
      if (currentView === "today" && task.dueDate !== todayISO()) return false;
      if (currentView === "upcoming" && (!task.dueDate || task.dueDate <= todayISO() || task.completed)) return false;
      if (currentView === "completed" && !task.completed) return false;
      if (currentView === "all" && task.completed && currentFilter !== "all") return false;
      if (currentFilter === "active" && task.completed) return false;
      if (currentFilter === "overdue" && !isOverdue(task)) return false;
      if (query && !`${task.title} ${task.notes || ""} ${task.category || ""} ${task.priority || ""}`.toLowerCase().includes(query)) return false;
      return true;
    });
    const sort = $("#sortSelect").value;
    list.sort((a,b) => {
      if (sort === "priority") return ({high:0,medium:1,low:2}[a.priority] ?? 1) - ({high:0,medium:1,low:2}[b.priority] ?? 1) || (a.dueDate || "9999").localeCompare(b.dueDate || "9999");
      if (sort === "created") return (b.createdAt || 0) - (a.createdAt || 0);
      if (sort === "title") return a.title.localeCompare(b.title);
      return (a.completed - b.completed) || (a.dueDate || "9999").localeCompare(b.dueDate || "9999") || (b.createdAt || 0) - (a.createdAt || 0);
    });
    return list;
  }
  function renderStats() {
    const total = tasks.length, completed = tasks.filter(t => t.completed).length, remaining = total - completed;
    $("#statTotal").textContent = total;
    $("#statCompleted").textContent = completed;
    $("#statRemaining").textContent = remaining;
    const percent = total ? Math.round(completed / total * 100) : 0;
    $("#progressText").textContent = `${percent}%`;
    $("#progressFill").style.width = `${percent}%`;
    $("#countAll").textContent = total;
    $("#countToday").textContent = tasks.filter(t => t.dueDate === todayISO() && !t.completed).length;
    $("#countCompleted").textContent = completed;
  }
  function renderCategories() {
    const nav = $("#categoryNav");
    nav.replaceChildren();
    categories.forEach((category, index) => {
      const button = document.createElement("button");
      button.className = "category-item" + (currentCategory === category ? " selected" : "");
      button.dataset.category = category;
      button.innerHTML = `<span class="category-color" style="background:${colors[index % colors.length]}"></span><span>${escapeHTML(category)}</span><span class="category-number">${tasks.filter(t => t.category === category && !t.completed).length}</span>`;
      nav.append(button);
    });
    const select = $("#taskCategory");
    const previous = select.value;
    select.replaceChildren();
    categories.forEach(category => {
      const option = document.createElement("option");
      option.value = category; option.textContent = category; select.append(option);
    });
    if (categories.includes(previous)) select.value = previous;
  }
  function renderTask(task) {
    const overdue = isOverdue(task);
    const due = dueLabel(task);
    const dateClass = overdue ? "overdue" : task.dueDate === todayISO() ? "today" : "";
    const priorityText = ({high:"High priority", medium:"Medium priority", low:"Low priority"})[task.priority] || "Medium priority";
    const el = document.createElement("article");
    el.className = "task-row" + (task.completed ? " completed" : "");
    el.dataset.id = task.id;
    el.innerHTML = `
      <input class="task-check" type="checkbox" aria-label="${task.completed ? "Mark active" : "Mark completed"}: ${escapeHTML(task.title)}" ${task.completed ? "checked" : ""}>
      <div class="task-main">
        <div class="task-title-line"><span class="task-title">${escapeHTML(task.title)}</span></div>
        ${task.notes ? `<p class="task-notes">${escapeHTML(task.notes)}</p>` : ""}
        <div class="task-meta">
          <span class="priority ${escapeHTML(task.priority || "medium")}"><span class="priority-dot"></span>${priorityText}</span>
          <span class="task-category">${escapeHTML(task.category || "Personal")}</span>
          ${due ? `<span class="due-date ${dateClass}"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>${escapeHTML(due)}</span>` : ""}
        </div>
      </div>
      <div class="task-actions">
        <button class="task-action edit" aria-label="Edit ${escapeHTML(task.title)}" title="Edit task"><svg viewBox="0 0 24 24"><path d="m14 5 5 5M4 20l4.5-1 10.8-10.8a2.1 2.1 0 0 0-3-3L5.5 16 4 20Z"/></svg></button>
        <button class="task-action delete" aria-label="Delete ${escapeHTML(task.title)}" title="Delete task"><svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v6m6-6v6"/></svg></button>
      </div>`;
    return el;
  }
  function render() {
    updateDate(); renderStats(); renderCategories();
    const [title, subtitle, listHeading, listDescription] = viewInfo();
    $("#pageTitle").textContent = title; $("#pageSubtitle").textContent = subtitle;
    $("#listHeading").textContent = listHeading; $("#listDescription").textContent = listDescription;
    $$(".nav-item").forEach(btn => btn.classList.toggle("selected", !currentCategory && btn.dataset.view === currentView));
    $$(".mobile-view").forEach(btn => btn.classList.toggle("selected", !currentCategory && btn.dataset.view === currentView));
    const list = visibleTasks();
    $("#taskList").replaceChildren(...list.map(renderTask));
    $("#resultCount").textContent = `${list.length} ${list.length === 1 ? "task" : "tasks"}`;
    $("#taskList").hidden = list.length === 0;
    $("#emptyState").hidden = list.length !== 0;
    if (!tasks.length) { $("#emptyTitle").textContent = "A fresh start."; $("#emptyMessage").textContent = "Add a task to turn your plans into progress."; }
    else if ($("#searchInput").value.trim()) { $("#emptyTitle").textContent = "No matches yet."; $("#emptyMessage").textContent = "Try a different search or clear your filters."; }
    else if (currentView === "completed") { $("#emptyTitle").textContent = "Nothing checked off just yet."; $("#emptyMessage").textContent = "Completed tasks will find a home here."; }
    else if (currentView === "today") { $("#emptyTitle").textContent = "A little breathing room."; $("#emptyMessage").textContent = "No tasks due today. Enjoy the space or add something new."; }
    else if (currentView === "upcoming") { $("#emptyTitle").textContent = "Nothing on the horizon."; $("#emptyMessage").textContent = "Add a future due date and it will show up here."; }
    else { $("#emptyTitle").textContent = "No tasks in this view."; $("#emptyMessage").textContent = "Try another filter or add a task to get started."; }
    $("#emptyAdd").hidden = currentView === "completed" && tasks.length > 0;
  }
  function openTaskDialog(task = null) {
    editingId = task ? task.id : null;
    $("#taskForm").reset();
    $("#titleError").hidden = true; $("#dialogError").hidden = true;
    $("#dialogTitle").textContent = task ? "Edit task" : "Add a task";
    $("#saveTaskText").textContent = task ? "Save changes" : "Add task";
    if (task) {
      $("#taskTitle").value = task.title;
      $("#taskNotes").value = task.notes || "";
      $("#taskDue").value = task.dueDate || "";
      $("#taskPriority").value = task.priority || "medium";
      $("#taskCategory").value = task.category || categories[0] || "Personal";
    } else {
      $("#taskPriority").value = "medium";
      $("#taskCategory").value = currentCategory && categories.includes(currentCategory) ? currentCategory : (categories[0] || "Personal");
    }
    $("#taskDialog").showModal();
    setTimeout(() => $("#taskTitle").focus(), 40);
  }
  function closeDialog() { if ($("#taskDialog").open) $("#taskDialog").close(); }
  function submitTask(event) {
    event.preventDefault();
    const title = $("#taskTitle").value.trim();
    if (!title) { $("#titleError").hidden = false; $("#taskTitle").focus(); return; }
    const dueDate = $("#taskDue").value;
    if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) { $("#dialogError").textContent = "Please choose a valid due date."; $("#dialogError").hidden = false; return; }
    const values = { title, notes:$("#taskNotes").value.trim(), dueDate, priority:$("#taskPriority").value, category:$("#taskCategory").value || categories[0] || "Personal" };
    if (editingId) {
      const index = tasks.findIndex(t => t.id === editingId);
      if (index < 0) { $("#dialogError").textContent = "This task could not be found. Please close and try again."; $("#dialogError").hidden = false; return; }
      tasks[index] = {...tasks[index], ...values, updatedAt:Date.now()};
      if (saveTasks()) showToast("Task updated.");
    } else {
      tasks.unshift({id:makeId(), ...values, completed:false, createdAt:Date.now()});
      if (saveTasks()) showToast("Task added.");
    }
    closeDialog(); render();
  }
  function askDelete(id) {
    const task = tasks.find(t => t.id === id); if (!task) return;
    pendingDeleteId = id;
    $("#confirmTitle").textContent = "Delete this task?";
    $("#confirmMessage").textContent = `“${task.title}” will be permanently removed from your list.`;
    $("#confirmAction").textContent = "Delete task";
    $("#confirmDialog").showModal();
  }
  function deletePending() {
    if (!pendingDeleteId) return;
    tasks = tasks.filter(t => t.id !== pendingDeleteId);
    pendingDeleteId = null;
    $("#confirmDialog").close();
    if (saveTasks()) showToast("Task deleted.");
    render();
  }
  function setView(view) { currentView = view; currentCategory = ""; currentFilter = "all"; $$(".filter-chip").forEach(b => b.classList.toggle("active", b.dataset.filter === "all")); render(); }
  function addCategory() {
    const name = prompt("Name your new category:");
    if (name === null) return;
    const clean = name.trim();
    if (!clean) { showToast("Category name cannot be empty.", "error"); return; }
    if (clean.length > 28) { showToast("Keep category names to 28 characters or fewer.", "error"); return; }
    if (categories.some(c => c.toLowerCase() === clean.toLowerCase())) { showToast("That category already exists.", "error"); return; }
    categories.push(clean); saveCategories(); currentCategory = clean; currentView = "all"; render(); showToast(`Category “${clean}” added.`);
  }
  function applyTheme(theme) {
    document.body.classList.toggle("dark", theme === "dark");
    $("#themeToggle").innerHTML = theme === "dark"
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 15.5A8.5 8.5 0 0 1 8.5 3.5 8.5 8.5 0 1 0 20.5 15.5Z"/></svg>';
    $("#themeToggle").setAttribute("aria-label", theme === "dark" ? "Switch to light theme" : "Switch to dark theme");
    try { localStorage.setItem(THEME_KEY, theme); } catch {}
  }

  $("#mainAdd").addEventListener("click", () => openTaskDialog());
  $("#sidebarAdd").addEventListener("click", () => openTaskDialog());
  $("#emptyAdd").addEventListener("click", () => openTaskDialog());
  $("#taskForm").addEventListener("submit", submitTask);
  $$("[data-close]").forEach(btn => btn.addEventListener("click", closeDialog));
  $("#cancelConfirm").addEventListener("click", () => { pendingDeleteId = null; $("#confirmDialog").close(); });
  $("#confirmAction").addEventListener("click", deletePending);
  $("#searchInput").addEventListener("input", render);
  $("#sortSelect").addEventListener("change", render);
  $("#addCategory").addEventListener("click", addCategory);
  $("#themeToggle").addEventListener("click", () => applyTheme(document.body.classList.contains("dark") ? "light" : "dark"));
  $("#profileButton").addEventListener("click", () => showToast("Daymark keeps your task list on this device."));
  $("#topToday").addEventListener("click", e => { e.preventDefault(); setView("today"); });
  $$(".nav-item, .mobile-view").forEach(btn => btn.addEventListener("click", () => setView(btn.dataset.view)));
  $$(".filter-chip").forEach(btn => btn.addEventListener("click", () => { currentFilter = btn.dataset.filter; $$(".filter-chip").forEach(b => b.classList.toggle("active", b === btn)); render(); }));
  $("#categoryNav").addEventListener("click", e => {
    const btn = e.target.closest("[data-category]"); if (!btn) return;
    currentCategory = btn.dataset.category; currentView = "all"; currentFilter = "all";
    $$(".filter-chip").forEach(b => b.classList.toggle("active", b.dataset.filter === "all")); render();
  });
  $("#taskList").addEventListener("change", e => {
    const check = e.target.closest(".task-check"); if (!check) return;
    const row = check.closest(".task-row"), task = tasks.find(t => t.id === row.dataset.id); if (!task) return;
    task.completed = check.checked; task.updatedAt = Date.now(); saveTasks(); render(); showToast(task.completed ? "Nice work — task completed." : "Task moved back to your list.");
  });
  $("#taskList").addEventListener("click", e => {
    const row = e.target.closest(".task-row"); if (!row) return;
    if (e.target.closest(".edit")) { const task = tasks.find(t => t.id === row.dataset.id); if (task) openTaskDialog(task); }
    if (e.target.closest(".delete")) askDelete(row.dataset.id);
  });
  $("#taskDialog").addEventListener("click", e => { if (e.target === $("#taskDialog")) closeDialog(); });
  $("#confirmDialog").addEventListener("click", e => { if (e.target === $("#confirmDialog")) { pendingDeleteId = null; $("#confirmDialog").close(); } });
  $("#taskTitle").addEventListener("input", () => { if ($("#taskTitle").value.trim()) $("#titleError").hidden = true; });
  document.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); $("#searchInput").focus(); }
    if (e.key === "Escape" && $("#confirmDialog").open) pendingDeleteId = null;
  });

  // Normalize stored values so a malformed older entry cannot break rendering.
  tasks = Array.isArray(tasks) ? tasks.filter(t => t && typeof t.title === "string" && t.id).map(t => ({
    id:t.id, title:t.title, notes:typeof t.notes === "string" ? t.notes : "",
    dueDate:typeof t.dueDate === "string" ? t.dueDate : "",
    priority:["low","medium","high"].includes(t.priority) ? t.priority : "medium",
    category:typeof t.category === "string" && t.category ? t.category : "Personal",
    completed:Boolean(t.completed), createdAt:Number(t.createdAt) || Date.now()
  })) : [];
  if (!Array.isArray(categories) || categories.some(c => typeof c !== "string") || !categories.length) categories = [...defaultCategories];
  tasks.forEach(t => { if (!categories.includes(t.category)) categories.push(t.category); });
  saveTasks(); saveCategories();
  try { applyTheme(localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light"); } catch { applyTheme("light"); }
  render();
})();