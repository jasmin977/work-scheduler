/* ============================================================
   Employee Weekly Schedule Visualizer
   Plain JS, no dependencies. Data lives in localStorage.
   ============================================================ */

"use strict";

/* ---------------- constants ---------------- */

const DAY_NAMES = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const DAY_SHORT = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

const PALETTE = [
  { fill: "#c7d2fe", edge: "#4f46e5", text: "#3730a3" }, // indigo
  { fill: "#99f6e4", edge: "#0d9488", text: "#115e59" }, // teal
  { fill: "#fde68a", edge: "#d97706", text: "#92400e" }, // amber
  { fill: "#fecdd3", edge: "#e11d48", text: "#9f1239" }, // rose
  { fill: "#bae6fd", edge: "#0284c7", text: "#075985" }, // sky
  { fill: "#bbf7d0", edge: "#16a34a", text: "#166534" }, // green
  { fill: "#ddd6fe", edge: "#7c3aed", text: "#5b21b6" }, // violet
  { fill: "#fed7aa", edge: "#ea580c", text: "#9a3412" }, // orange
  { fill: "#a5f3fc", edge: "#0891b2", text: "#155e75" }, // cyan
  { fill: "#fbcfe8", edge: "#db2777", text: "#9d174d" }, // pink
];

const STORAGE_KEY = "ews:v1";

/* ---------------- state ---------------- */

let root = null;          // { currentStoreId, nextStoreId, stores: { id: store } }
let state = null;         // the currently selected store (points into root.stores)
let uiDay = 0;            // mobile: which day is shown
let focusedDay = null;    // focus mode: which day, or null
let copiedRow = null;     // [7 strings] clipboard for "copy employee schedule"

function sampleStore() {
  const employees = ["Empl-1", "Empl-2", "Empl-3", "Empl-4", "Empl-5", "Empl-6"]
    .map((name, i) => ({ id: "e" + (i + 1), name, color: i % PALETTE.length }));
  const sample = {
    e1: ["7-5", "7-1 5-9", "OFF", "8-4", "7-5", "7-1 5-9", "OFF"],
    e2: ["8-4", "8-4", "7-3", "OFF", "7-1 5-9", "8-4", "8-12"],
    e3: ["OFF", "9-5", "9-5", "9-5", "OFF", "9-5", "12-8"],
    e4: ["12-8", "OFF", "1-9", "1-9", "12-8", "OFF", "1-9"],
    e5: ["7:30-12:30", "7:30-12:30", "OFF", "7:30-3:30", "7:30-12:30", "2-10", "OFF"],
    e6: ["2-10", "2-10", "2-10", "OFF", "2-10", "OFF", "8-4"],
  };
  return {
    business: "Mon commerce",
    gridStart: 7,
    gridEnd: 22,
    employees,
    nextId: 7,
    cells: sample,
  };
}

function emptyStore() {
  return {
    business: "Nouveau commerce",
    gridStart: 7,
    gridEnd: 22,
    employees: [],
    nextId: 1,
    cells: {},
  };
}

// migrate a pre-multi-store single schedule (possibly still per-week) into a store
function migrateStore(old) {
  if (!old.cells && old.weeks) {
    const wk = old.weeks[old.weekStart] || Object.values(old.weeks)[0];
    old.cells = (wk && wk.cells) || {};
  }
  if (!old.cells) old.cells = {};
  delete old.weeks;
  delete old.weekStart;
  return old;
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data.stores) {
        root = data;
      } else if (data.employees) {
        root = { currentStoreId: "s1", nextStoreId: 2, stores: { s1: migrateStore(data) } };
      } else {
        throw new Error("bad state");
      }
      if (!root.stores[root.currentStoreId]) root.currentStoreId = Object.keys(root.stores)[0];
      state = root.stores[root.currentStoreId];
      if (!state) throw new Error("no store");
      return;
    }
  } catch (e) { /* fall through to defaults */ }
  root = { currentStoreId: "s1", nextStoreId: 2, stores: { s1: sampleStore() } };
  state = root.stores.s1;
}

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(root)); } catch (e) { /* storage full/blocked */ }
}

/* ---------------- stores ---------------- */

function renderStoreSelect() {
  const sel = $("#storeSelect");
  sel.innerHTML = "";
  for (const [id, st] of Object.entries(root.stores)) {
    sel.appendChild(new Option(st.business || "Sans nom", id, false, id === root.currentStoreId));
  }
}

function openStoreMenu(e) {
  const items = [
    { label: state.business || "Sans nom" },
    { label: "＋ Nouveau commerce", action: createStore },
  ];
  if (Object.keys(root.stores).length > 1) {
    items.push("sep");
    items.push({ label: "Supprimer ce commerce", danger: true, action: deleteStore });
  }
  openMenu(e, items);
}

function switchStore(id) {
  if (!root.stores[id]) return;
  root.currentStoreId = id;
  state = root.stores[id];
  copiedRow = null;
  if (focusedDay !== null) {
    focusedDay = null;
    document.body.classList.remove("focus-mode");
    $("#focusBar").hidden = true;
  }
  save();
  renderAll();
}

function createStore() {
  const id = "s" + root.nextStoreId++;
  root.stores[id] = emptyStore();
  switchStore(id);
  const bn = $("#businessName");
  bn.focus();
  bn.select();
}

function deleteStore() {
  const ids = Object.keys(root.stores);
  if (ids.length < 2) return;
  const name = state.business || "ce commerce";
  if (!window.confirm(`Supprimer « ${name} » et tout son planning ?`)) return;
  delete root.stores[root.currentStoreId];
  switchStore(Object.keys(root.stores)[0]);
}

function cellsFor(empId) {
  if (!state.cells[empId]) state.cells[empId] = ["", "", "", "", "", "", ""];
  return state.cells[empId];
}

/* ---------------- time parsing ----------------
   Accepts per cell:  "OFF" | "" | "7-5" | "7-1 5-9" | "7:30-12:30" | "9am-5pm" | "9-17"
   Returns { off, shifts:[{start,end}], invalid }  (minutes from midnight)      */

function parseTimeToken(tok) {
  const m = /^(\d{1,2})(?::(\d{1,2}))?\s*(am?|pm?)?$/i.exec(tok.trim());
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  if (h > 24 || min > 59) return null;
  const suffix = m[3] ? m[3][0].toLowerCase() : null;
  if (suffix === "a") return { value: (h % 12) * 60 + min, fixed: true };
  if (suffix === "p") return { value: ((h % 12) + 12) * 60 + min, fixed: true };
  if (h === 0 || h > 12) return { value: (h % 24) * 60 + min, fixed: true }; // 24h style
  return { value: h * 60 + min, fixed: false, hour12: h };
}

// Resolve an ambiguous 12h time to >= minAllowed by adding 12h when needed.
// t.value for "1".."11" is the AM candidate; a bare "12" is already noon (720).
function resolveTime(t, minAllowed) {
  if (t.fixed) return t.value;
  let v = t.value;
  if (v < minAllowed && v + 720 <= 1440) v += 720;
  return v;
}

function parseCell(text, gridStartMin) {
  const raw = (text || "").trim();
  if (!raw) return { off: false, shifts: [] };
  if (/^(off|repos|congé|conge|rest|x|-)$/i.test(raw)) return { off: true, shifts: [] };

  // normalize: unify dashes, strip spaces around them, then split shifts
  const norm = raw.replace(/[–—]/g, "-").replace(/\s*-\s*/g, "-").replace(/\s*(to)\s*/gi, "-");
  const tokens = norm.split(/[\s,;+]+/).filter(Boolean);
  const shifts = [];
  let prevEnd = 0;

  for (const tok of tokens) {
    const parts = tok.split("-");
    if (parts.length !== 2) return { off: false, shifts: [], invalid: true };
    const t1 = parseTimeToken(parts[0]);
    const t2 = parseTimeToken(parts[1]);
    if (!t1 || !t2) return { off: false, shifts: [], invalid: true };

    const start = resolveTime(t1, Math.max(gridStartMin, prevEnd));
    let end = resolveTime(t2, start + 1);
    if (end === 0) end = 1440; // "12am"/"24" as an end time means midnight
    if (end <= start || end > 1440) return { off: false, shifts: [], invalid: true };
    shifts.push({ start, end: Math.min(end, 1440) });
    prevEnd = end;
  }
  return { off: false, shifts };
}

/* ---------------- formatting ---------------- */

// French 24-hour display: "7h", "17h30"
function fmtHour(h) {
  const hh = ((h % 24) + 24) % 24;
  return `${hh}h`;
}

function fmtTime(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

function fmtHours(mins) {
  const h = mins / 60;
  return (Number.isInteger(h) ? String(h) : h.toFixed(1).replace(".", ",")) + "h";
}

function empColor(emp) { return PALETTE[emp.color % PALETTE.length]; }

/* ---------------- DOM helpers ---------------- */

const $ = (sel) => document.querySelector(sel);
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

/* ============================================================
   INPUT GRID
   ============================================================ */

function renderGrid() {
  const head = $("#gridHead");
  head.innerHTML = "";
  const thName = el("th", "", "Employé");
  head.appendChild(thName);
  for (let d = 0; d < 7; d++) {
    const th = el("th", "day-col");
    th.appendChild(document.createTextNode(DAY_SHORT[d]));
    const btn = el("button", "col-menu-btn", "▾");
    btn.type = "button";
    btn.title = "Actions du jour";
    btn.addEventListener("click", (e) => openDayMenu(e, d));
    th.appendChild(btn);
    head.appendChild(th);
  }
  head.appendChild(el("th", "", ""));

  const body = $("#gridBody");
  body.innerHTML = "";
  state.employees.forEach((emp, idx) => body.appendChild(buildGridRow(emp, idx)));
}

function buildGridRow(emp, idx) {
  const tr = el("tr");
  tr.dataset.empId = emp.id;
  tr.dataset.idx = String(idx);

  // name cell with drag handle
  const tdName = el("td");
  const wrap = el("div", "emp-cell");
  const handle = el("span", "drag-handle", "⠿");
  handle.title = "Glisser pour réorganiser";
  handle.draggable = true;
  wrap.appendChild(handle);
  const dot = el("span", "emp-dot");
  dot.style.background = empColor(emp).edge;
  wrap.appendChild(dot);
  const nameInput = el("input", "emp-name-input");
  nameInput.type = "text";
  nameInput.value = emp.name;
  nameInput.title = "Cliquez pour renommer";
  nameInput.autocomplete = "off";
  nameInput.spellcheck = false;
  nameInput.addEventListener("input", () => {
    const v = nameInput.value.trim();
    if (!v) return; // keep the previous name until something is typed
    emp.name = v;
    save();
    renderSchedule();
    renderSummary();
  });
  nameInput.addEventListener("blur", () => {
    if (!nameInput.value.trim()) nameInput.value = emp.name; // restore if left empty
  });
  nameInput.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") { ev.preventDefault(); nameInput.blur(); }
    ev.stopPropagation(); // don't let grid arrow-navigation steal caret keys
  });
  wrap.appendChild(nameInput);
  const menuBtn = el("button", "row-btn", "⋯");
  menuBtn.type = "button";
  menuBtn.title = "Actions employé";
  menuBtn.addEventListener("click", (e) => openRowMenu(e, emp.id));
  wrap.appendChild(menuBtn);
  tdName.appendChild(wrap);
  tr.appendChild(tdName);

  // 7 day inputs
  const cells = cellsFor(emp.id);
  for (let d = 0; d < 7; d++) {
    const td = el("td");
    const input = el("input", "cell-input");
    input.type = "text";
    input.value = cells[d] || "";
    input.placeholder = "·";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.dataset.empId = emp.id;
    input.dataset.day = String(d);
    input.addEventListener("input", onCellInput);
    input.addEventListener("keydown", onCellKeydown);
    input.addEventListener("focus", () => input.select());
    styleCellInput(input);
    td.appendChild(input);
    tr.appendChild(td);
  }

  const tdDel = el("td");
  const del = el("button", "row-btn del", "✕");
  del.type = "button";
  del.title = "Supprimer l'employé";
  del.addEventListener("click", () => removeEmployee(emp.id));
  tdDel.appendChild(del);
  tr.appendChild(tdDel);

  attachRowDnD(tr, handle);
  return tr;
}

function styleCellInput(input) {
  const parsed = parseCell(input.value, state.gridStart * 60);
  input.classList.toggle("invalid", !!parsed.invalid);
  input.classList.toggle("is-off", parsed.off);
}

function onCellInput(e) {
  const input = e.target;
  const empId = input.dataset.empId;
  const d = +input.dataset.day;
  cellsFor(empId)[d] = input.value;
  styleCellInput(input);
  save();
  renderSchedule();
  renderSummary();
}

function focusCell(empIdx, day) {
  const emp = state.employees[empIdx];
  if (!emp || day < 0 || day > 6) return false;
  const target = document.querySelector(`.cell-input[data-emp-id="${emp.id}"][data-day="${day}"]`);
  if (target) { target.focus(); return true; }
  return false;
}

function onCellKeydown(e) {
  const input = e.target;
  const d = +input.dataset.day;
  const idx = state.employees.findIndex((x) => x.id === input.dataset.empId);

  if (e.key === "Enter") {
    e.preventDefault();
    if (!focusCell(idx + 1, d)) focusCell(0, d); // wrap to first employee
    return;
  }

  if (e.key === "ArrowDown") {
    if (focusCell(idx + 1, d)) e.preventDefault();
    return;
  }
  if (e.key === "ArrowUp") {
    if (focusCell(idx - 1, d)) e.preventDefault();
    return;
  }

  // left/right only navigate when the caret is at the edge of the text
  // (or everything is selected, as right after focusing) — otherwise the
  // arrow keys keep moving the caret inside the cell while editing.
  const len = input.value.length;
  if (e.key === "ArrowRight" && input.selectionEnd === len) {
    const moved = d < 6 ? focusCell(idx, d + 1) : focusCell(idx + 1, 0);
    if (moved) e.preventDefault();
    return;
  }
  if (e.key === "ArrowLeft" && input.selectionStart === 0) {
    const moved = d > 0 ? focusCell(idx, d - 1) : focusCell(idx - 1, 6);
    if (moved) e.preventDefault();
  }
}

/* ---------------- employees ---------------- */

function addEmployee(name) {
  const trimmed = name.trim();
  if (!trimmed) return;
  const emp = { id: "e" + state.nextId++, name: trimmed, color: (state.employees.length) % PALETTE.length };
  state.employees.push(emp);
  save();
  renderAll();
}

function removeEmployee(empId) {
  state.employees = state.employees.filter((e) => e.id !== empId);
  delete state.cells[empId];
  save();
  renderAll();
}

/* ---------------- drag & drop reorder ---------------- */

let dragIdx = null;

function attachRowDnD(tr, handle) {
  handle.addEventListener("dragstart", (e) => {
    dragIdx = +tr.dataset.idx;
    tr.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", String(dragIdx)); } catch (_) { }
    e.dataTransfer.setDragImage(tr, 20, 12);
  });
  handle.addEventListener("dragend", () => {
    tr.classList.remove("dragging");
    document.querySelectorAll("#gridBody tr.drag-over").forEach((r) => r.classList.remove("drag-over"));
    dragIdx = null;
  });
  tr.addEventListener("dragover", (e) => {
    if (dragIdx === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    document.querySelectorAll("#gridBody tr.drag-over").forEach((r) => r.classList.remove("drag-over"));
    tr.classList.add("drag-over");
  });
  tr.addEventListener("drop", (e) => {
    if (dragIdx === null) return;
    e.preventDefault();
    const to = +tr.dataset.idx;
    if (to !== dragIdx) {
      const [moved] = state.employees.splice(dragIdx, 1);
      state.employees.splice(to, 0, moved);
      save();
      renderAll();
    }
    dragIdx = null;
  });
}

/* ============================================================
   VISUAL SCHEDULE
   ============================================================ */

function gridHours() {
  return { start: state.gridStart, end: state.gridEnd, count: state.gridEnd - state.gridStart };
}

function renderSchedule() {
  $("#printBusiness").textContent = state.business || "";

  const container = $("#days");
  container.innerHTML = "";
  for (let d = 0; d < 7; d++) container.appendChild(buildDayCard(d));
  applyMobileVisibility();
  applyFocusVisibility();
}

function buildDayCard(d) {
  const { start, end, count } = gridHours();
  const gMin = start * 60, gSpan = (end - start) * 60;

  const card = el("div", "day-card");
  card.dataset.day = String(d);

  // header
  const head = el("div", "day-head");
  head.appendChild(el("span", "day-title", DAY_NAMES[d]));
  const actions = el("div", "day-actions no-print");
  const zoom = el("button", "", focusedDay === d ? "⤡" : "⤢");
  zoom.title = focusedDay === d ? "Retour à la semaine" : "Agrandir cette journée";
  zoom.addEventListener("click", () => toggleFocus(d));
  actions.appendChild(zoom);
  const menu = el("button", "", "⋯");
  menu.title = "Actions du jour";
  menu.addEventListener("click", (e) => openDayMenu(e, d));
  actions.appendChild(menu);
  head.appendChild(actions);
  card.appendChild(head);

  const scroll = el("div", "tt-scroll");
  const tt = el("div", "timetable");

  // hour axis
  const axis = el("div", "tt-row tt-axis");
  axis.appendChild(el("div", "tt-name", ""));
  const axisTrack = el("div", "tt-track");
  for (let h = start; h < end; h++) axisTrack.appendChild(el("div", "axis-cell", fmtHour(h)));
  axis.appendChild(axisTrack);
  tt.appendChild(axis);

  // one row per employee
  const bgSize = `${(100 / count).toFixed(4)}% 100%`;
  for (const emp of state.employees) {
    const row = el("div", "tt-row");
    const name = el("div", "tt-name");
    const dot = el("span", "emp-dot");
    dot.style.background = empColor(emp).edge;
    name.appendChild(dot);
    name.appendChild(document.createTextNode(emp.name));
    row.appendChild(name);

    const track = el("div", "tt-track");
    track.style.backgroundSize = bgSize;

    const parsed = parseCell(cellsFor(emp.id)[d], gMin);
    if (parsed.off) {
      track.appendChild(el("div", "off-band", "OFF · REPOS"));
    } else {
      for (const s of parsed.shifts) {
        const a = Math.max(s.start, gMin);
        const b = Math.min(s.end, gMin + gSpan);
        if (b <= a) continue; // entirely outside the visible grid
        const block = el("div", "block", `${fmtTime(s.start)} – ${fmtTime(s.end)}`);
        const c = empColor(emp);
        block.style.left = `${((a - gMin) / gSpan) * 100}%`;
        block.style.width = `${((b - a) / gSpan) * 100}%`;
        block.style.background = c.fill;
        block.style.color = c.text;
        block.style.border = `1.5px solid ${c.edge}`;
        block.title = `${emp.name} : ${fmtTime(s.start)} – ${fmtTime(s.end)}`;
        track.appendChild(block);
      }
    }
    row.appendChild(track);
    tt.appendChild(row);
  }

  // staffing strip
  const counts = staffingCounts(d);
  const maxCount = Math.max(1, ...counts);
  const staff = el("div", "tt-row staffing");
  staff.appendChild(el("div", "tt-name", "Effectif"));
  const strack = el("div", "tt-track");
  counts.forEach((c) => {
    const cell = el("div", "staff-cell", c === 0 ? "–" : String(c));
    if (c === 0) cell.classList.add("s0");
    else if (c === 1) cell.classList.add("s-low");
    else if (c >= Math.max(2, Math.ceil(maxCount * 0.75))) cell.classList.add("s-high");
    else cell.classList.add("s-mid");
    cell.title = c === 0 ? "Personne de prévu" : `${c} employé${c > 1 ? "s" : ""}`;
    strack.appendChild(cell);
  });
  staff.appendChild(strack);
  tt.appendChild(staff);

  scroll.appendChild(tt);
  card.appendChild(scroll);
  return card;
}

function staffingCounts(d) {
  const { start, end } = gridHours();
  const counts = [];
  const parsedAll = state.employees.map((emp) => parseCell(cellsFor(emp.id)[d], start * 60));
  for (let h = start; h < end; h++) {
    const a = h * 60, b = a + 60;
    let n = 0;
    for (const p of parsedAll) {
      if (p.shifts.some((s) => s.start < b && s.end > a)) n++;
    }
    counts.push(n);
  }
  return counts;
}

/* ============================================================
   SUMMARY
   ============================================================ */

function employeeStats(empId) {
  const gMin = state.gridStart * 60;
  let minutes = 0, days = 0, offs = 0, shifts = 0;
  const cells = cellsFor(empId);
  for (let d = 0; d < 7; d++) {
    const p = parseCell(cells[d], gMin);
    if (p.off) { offs++; continue; }
    if (p.shifts.length) {
      days++;
      shifts += p.shifts.length;
      minutes += p.shifts.reduce((s, x) => s + (x.end - x.start), 0);
    }
  }
  return { minutes, days, offs, shifts };
}

function renderSummary() {
  const body = $("#summaryBody");
  body.innerHTML = "";
  let totalMin = 0, totalShifts = 0;

  for (const emp of state.employees) {
    const st = employeeStats(emp.id);
    totalMin += st.minutes;
    totalShifts += st.shifts;
    const tr = el("tr");
    const tdName = el("td");
    const wrap = el("div", "emp-cell");
    const dot = el("span", "emp-dot");
    dot.style.background = empColor(emp).edge;
    wrap.appendChild(dot);
    wrap.appendChild(el("span", "emp-name", emp.name));
    tdName.appendChild(wrap);
    tr.appendChild(tdName);
    tr.appendChild(el("td", "", st.minutes ? fmtHours(st.minutes) : "—"));
    tr.appendChild(el("td", "", String(st.days)));
    tr.appendChild(el("td", "", String(st.offs)));
    body.appendChild(tr);
  }

  const chips = $("#summaryChips");
  chips.innerHTML = "";
  const chip = (label, value) => {
    const c = el("div", "chip");
    c.appendChild(el("b", "", String(value)));
    c.appendChild(document.createTextNode(label));
    chips.appendChild(c);
  };
  chip(" employés", state.employees.length);
  chip(" planifiées", fmtHours(totalMin));

}

/* ============================================================
   CONTEXT MENUS
   ============================================================ */

const popMenu = document.getElementById("popMenu");

function openMenu(anchorEvent, items) {
  popMenu.innerHTML = "";
  for (const it of items) {
    if (it === "sep") { popMenu.appendChild(el("div", "menu-sep")); continue; }
    if (it.label !== undefined && !it.action) { popMenu.appendChild(el("div", "menu-label", it.label)); continue; }
    const btn = el("button", it.danger ? "danger" : "", it.label);
    btn.type = "button";
    btn.addEventListener("click", () => { closeMenu(); it.action(); });
    popMenu.appendChild(btn);
  }
  popMenu.hidden = false;
  const r = anchorEvent.currentTarget.getBoundingClientRect();
  const mw = popMenu.offsetWidth, mh = popMenu.offsetHeight;
  let x = Math.min(r.left, window.innerWidth - mw - 8);
  let y = r.bottom + 4;
  if (y + mh > window.innerHeight - 8) y = Math.max(8, r.top - mh - 4);
  popMenu.style.left = x + "px";
  popMenu.style.top = y + "px";
  anchorEvent.stopPropagation();
}

function closeMenu() { popMenu.hidden = true; }
document.addEventListener("click", (e) => { if (!popMenu.contains(e.target)) closeMenu(); });
window.addEventListener("scroll", closeMenu, true);

function openDayMenu(e, d) {
  const items = [{ label: `Copier ${DAY_NAMES[d].toLowerCase()} vers…` }];
  for (let t = 0; t < 7; t++) {
    if (t === d) continue;
    items.push({ label: `→ ${DAY_NAMES[t]}`, action: () => copyDay(d, t) });
  }
  items.push("sep");
  items.push({ label: "⬇ Télécharger le jour en image", action: () => downloadImage([d]) });
  items.push({ label: "Vider la journée", danger: true, action: () => clearDay(d) });
  openMenu(e, items);
}

function openRowMenu(e, empId) {
  const emp = state.employees.find((x) => x.id === empId);
  const items = [
    { label: "Copier le planning", action: () => { copiedRow = cellsFor(empId).slice(); } },
  ];
  if (copiedRow) items.push({ label: "Coller le planning ici", action: () => { state.cells[empId] = copiedRow.slice(); save(); renderAll(); } });
  items.push("sep");
  items.push({ label: `Vider la semaine de ${emp ? emp.name : "l'employé"}`, danger: true, action: () => { state.cells[empId] = ["", "", "", "", "", "", ""]; save(); renderAll(); } });
  items.push({ label: "Supprimer l'employé", danger: true, action: () => removeEmployee(empId) });
  openMenu(e, items);
}

function copyDay(from, to) {
  for (const emp of state.employees) {
    const cells = cellsFor(emp.id);
    cells[to] = cells[from];
  }
  save();
  renderAll();
}

function clearDay(d) {
  for (const emp of state.employees) cellsFor(emp.id)[d] = "";
  save();
  renderAll();
}

/* ============================================================
   SETTINGS
   ============================================================ */

function initRangeSelects() {
  const s = $("#gridStart"), e = $("#gridEnd");
  s.innerHTML = ""; e.innerHTML = "";
  for (let h = 0; h <= 23; h++) s.appendChild(new Option(fmtHour(h), h));
  for (let h = 1; h <= 24; h++) e.appendChild(new Option(h === 24 ? "24h" : fmtHour(h), h));
  s.value = state.gridStart;
  e.value = state.gridEnd;
  s.addEventListener("change", () => {
    state.gridStart = +s.value;
    if (state.gridEnd <= state.gridStart) { state.gridEnd = Math.min(24, state.gridStart + 1); e.value = state.gridEnd; }
    save(); renderAll();
  });
  e.addEventListener("change", () => {
    state.gridEnd = +e.value;
    if (state.gridEnd <= state.gridStart) { state.gridStart = Math.max(0, state.gridEnd - 1); s.value = state.gridStart; }
    save(); renderAll();
  });
}

/* ============================================================
   FOCUS MODE & MOBILE
   ============================================================ */

function toggleFocus(d) {
  focusedDay = focusedDay === d ? null : d;
  document.body.classList.toggle("focus-mode", focusedDay !== null);
  $("#focusBar").hidden = focusedDay === null;
  renderSchedule();
}
function applyFocusVisibility() {
  document.querySelectorAll(".day-card").forEach((card) => {
    card.classList.toggle("focused", focusedDay !== null && +card.dataset.day === focusedDay);
  });
}

const mq = window.matchMedia("(max-width: 760px)");
function applyMobile() {
  document.body.classList.toggle("mobile", mq.matches);
  renderDayNav();
  applyMobileVisibility();
}
function applyMobileVisibility() {
  document.querySelectorAll(".day-card").forEach((card) => {
    card.classList.toggle("mobile-active", +card.dataset.day === uiDay);
  });
}
function renderDayNav() {
  const nav = $("#dayNav");
  nav.innerHTML = "";
  for (let d = 0; d < 7; d++) {
    const b = el("button", d === uiDay ? "active" : "", DAY_SHORT[d]);
    b.addEventListener("click", () => { uiDay = d; renderDayNav(); applyMobileVisibility(); });
    nav.appendChild(b);
  }
}

/* ============================================================
   PNG EXPORT (custom canvas renderer — no libraries)
   ============================================================ */

const EX = {
  scale: 2,
  width: 1560,
  margin: 40,
  nameW: 190,
  rowH: 46,
  axisH: 30,
  staffH: 26,
  dayTitleH: 40,
  dayPad: 16,
  dayGap: 26,
};

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function dayBlockHeight() {
  return EX.dayTitleH + EX.axisH + state.employees.length * EX.rowH + EX.staffH + EX.dayPad * 2;
}

function drawDay(ctx, d, x, y, width) {
  const { start, end } = gridHours();
  const gMin = start * 60, gSpan = (end - start) * 60;
  const trackX = x + EX.dayPad + EX.nameW;
  const trackW = width - EX.dayPad * 2 - EX.nameW;
  const hourW = trackW / (end - start);
  const totalH = dayBlockHeight();

  // card
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, width, totalH, 12);
  ctx.fill();
  ctx.stroke();

  // title
  ctx.fillStyle = "#1e293b";
  ctx.font = "700 19px Segoe UI, Arial";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  const titleY = y + EX.dayPad + EX.dayTitleH / 2 - 6;
  ctx.fillText(DAY_NAMES[d].toUpperCase(), x + EX.dayPad, titleY);

  const axisY = y + EX.dayPad + EX.dayTitleH;
  const rowsY = axisY + EX.axisH;
  const staffY = rowsY + state.employees.length * EX.rowH;

  // hour axis labels + vertical gridlines
  ctx.font = "600 11px Segoe UI, Arial";
  for (let h = start; h < end; h++) {
    const hx = trackX + (h - start) * hourW;
    ctx.fillStyle = "#64748b";
    ctx.textAlign = "left";
    ctx.fillText(fmtHour(h), hx + 5, axisY + EX.axisH / 2);
    ctx.strokeStyle = "#e2e8f0";
    ctx.beginPath();
    ctx.moveTo(hx + 0.5, axisY + EX.axisH - 4);
    ctx.lineTo(hx + 0.5, staffY + EX.staffH);
    ctx.stroke();
  }
  // axis underline
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x + EX.dayPad, axisY + EX.axisH - 2);
  ctx.lineTo(x + width - EX.dayPad, axisY + EX.axisH - 2);
  ctx.stroke();
  ctx.lineWidth = 1;

  // employee rows
  state.employees.forEach((emp, i) => {
    const ry = rowsY + i * EX.rowH;
    const c = empColor(emp);

    // row separator
    ctx.strokeStyle = "#eef1f6";
    ctx.beginPath();
    ctx.moveTo(x + EX.dayPad, ry + EX.rowH);
    ctx.lineTo(x + width - EX.dayPad, ry + EX.rowH);
    ctx.stroke();

    // name + dot
    ctx.fillStyle = c.edge;
    ctx.beginPath();
    ctx.arc(x + EX.dayPad + 8, ry + EX.rowH / 2, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1e293b";
    ctx.font = "600 14px Segoe UI, Arial";
    ctx.textAlign = "left";
    ctx.fillText(emp.name, x + EX.dayPad + 20, ry + EX.rowH / 2, EX.nameW - 30);

    const parsed = parseCell(cellsFor(emp.id)[d], gMin);
    if (parsed.off) {
      ctx.fillStyle = "#f1f5f9";
      roundRect(ctx, trackX + 4, ry + 8, trackW - 8, EX.rowH - 16, 8);
      ctx.fill();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "#cbd5e1";
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "700 11px Segoe UI, Arial";
      ctx.textAlign = "center";
      ctx.fillText("O F F   ·   R E P O S", trackX + trackW / 2, ry + EX.rowH / 2);
    } else {
      for (const s of parsed.shifts) {
        const a = Math.max(s.start, gMin);
        const b = Math.min(s.end, gMin + gSpan);
        if (b <= a) continue;
        const bx = trackX + ((a - gMin) / gSpan) * trackW;
        const bw = ((b - a) / gSpan) * trackW;
        ctx.fillStyle = c.fill;
        roundRect(ctx, bx, ry + 7, bw, EX.rowH - 14, 8);
        ctx.fill();
        ctx.strokeStyle = c.edge;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.lineWidth = 1;
        const label = `${fmtTime(s.start)} – ${fmtTime(s.end)}`;
        ctx.font = "600 12px Segoe UI, Arial";
        if (ctx.measureText(label).width < bw - 10) {
          ctx.fillStyle = c.text;
          ctx.textAlign = "center";
          ctx.fillText(label, bx + bw / 2, ry + EX.rowH / 2);
        }
      }
    }
  });

  // staffing strip
  const counts = staffingCounts(d);
  const maxCount = Math.max(1, ...counts);
  ctx.font = "600 11px Segoe UI, Arial";
  ctx.textAlign = "left";
  ctx.fillStyle = "#94a3b8";
  ctx.fillText("EFFECTIF", x + EX.dayPad, staffY + EX.staffH / 2);
  counts.forEach((n, i) => {
    const cx = trackX + i * hourW;
    if (n > 0) {
      ctx.fillStyle = n === 1 ? "#fff7ed" : (n >= Math.max(2, Math.ceil(maxCount * 0.75)) ? "#ecfdf5" : "#eef2ff");
      ctx.fillRect(cx + 1, staffY + 2, hourW - 2, EX.staffH - 4);
    }
    ctx.fillStyle = n === 0 ? "#cbd5e1" : (n === 1 ? "#c2410c" : (n >= Math.max(2, Math.ceil(maxCount * 0.75)) ? "#047857" : "#4338ca"));
    ctx.font = "700 11px Segoe UI, Arial";
    ctx.textAlign = "center";
    ctx.fillText(n === 0 ? "–" : String(n), cx + hourW / 2, staffY + EX.staffH / 2);
  });

  return totalH;
}

// "Boutique Centre-Ville" → "boutique-centre-ville" (for file names)
function slugify(s) {
  return (s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function downloadImage(dayIndices) {
  const days = dayIndices || [0, 1, 2, 3, 4, 5, 6];
  const headerH = 92;
  const W = EX.width;
  const totalH = EX.margin * 2 + headerH +
    days.length * dayBlockHeight() + (days.length - 1) * EX.dayGap;

  const canvas = document.createElement("canvas");
  canvas.width = W * EX.scale;
  canvas.height = totalH * EX.scale;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(EX.scale, 0, 0, EX.scale, 0, 0);

  // background
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, W, totalH);

  // header
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  let hy = EX.margin;
  const storeName = (state.business || "").trim();
  if (storeName) {
    ctx.fillStyle = "#1e293b";
    ctx.font = "700 30px Segoe UI, Arial";
    ctx.fillText(storeName, W / 2, hy + 18);
  }
  ctx.fillStyle = "#4f46e5";
  ctx.font = "700 15px Segoe UI, Arial";
  const title = days.length === 1 ? `PLANNING DU ${DAY_NAMES[days[0]].toUpperCase()}` : "PLANNING HEBDOMADAIRE DES EMPLOYÉS";
  ctx.fillText(title.split("").join(" "), W / 2, hy + (storeName ? 60 : 30));

  // day blocks
  let y = EX.margin + headerH;
  for (const d of days) {
    drawDay(ctx, d, EX.margin, y, W - EX.margin * 2);
    y += dayBlockHeight() + EX.dayGap;
  }

  const storeSlug = slugify(state.business);
  const base = storeSlug ? `planning-${storeSlug}` : "planning";
  const fname = days.length === 1
    ? `${base}-${DAY_NAMES[days[0]].toLowerCase()}.png`
    : `${base}-semaine.png`;

  canvas.toBlob((blob) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }, "image/png");
}

/* ============================================================
   RENDER ALL / INIT
   ============================================================ */

function renderAll() {
  renderStoreSelect();
  renderGrid();
  renderSchedule();
  renderSummary();
  $("#businessName").value = state.business;
  $("#gridStart").value = state.gridStart;
  $("#gridEnd").value = state.gridEnd;
}

function init() {
  load();
  initRangeSelects();
  renderAll();
  renderDayNav();
  applyMobile();
  mq.addEventListener("change", applyMobile);

  // null-safe listener: a control removed from the markup must not
  // abort init and take the remaining buttons down with it
  const on = (sel, evt, fn) => {
    const node = $(sel);
    if (node) node.addEventListener(evt, fn);
  };

  on("#businessName", "input", (e) => {
    state.business = e.target.value;
    $("#printBusiness").textContent = state.business;
    renderStoreSelect(); // keep the switcher label in sync while renaming
    save();
  });

  on("#storeSelect", "change", (e) => switchStore(e.target.value));
  on("#newStore", "click", createStore); // optional button; also in the ⋯ menu
  on("#storeMenu", "click", openStoreMenu);

  on("#addForm", "submit", (e) => {
    e.preventDefault();
    const input = $("#newEmployee");
    addEmployee(input.value);
    input.value = "";
    input.focus();
  });

  on("#printBtn", "click", () => window.print());
  on("#downloadBtn", "click", () => downloadImage(null));
  on("#exitFocus", "click", () => toggleFocus(focusedDay));
}

document.addEventListener("DOMContentLoaded", init);
