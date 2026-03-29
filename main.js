// data.js runs first and sets window.__APP_DATA__
if (!window.__APP_DATA__) {
  throw new Error("Load data.js before main.js (see index.html script order).");
}
const data = window.__APP_DATA__;

function phaseForWeek(routine, week) {
  const rule = routine.phaseRule;
  if (rule.type === "constant") return rule.value;
  if (rule.type === "weekThresholds") {
    for (const [maxWeek, phase] of rule.rules) {
      if (week <= maxWeek) return phase;
    }
    return rule.otherwise;
  }
  throw new Error("Unknown phaseRule: " + JSON.stringify(rule));
}

const ROUTINES = data.routines.map((r) => ({ ...r, exerciseInfo: data.exerciseInfo }));
const ROUTINE_MAP = Object.fromEntries(ROUTINES.map((r) => [r.id, r]));

// ── STATE ─────────────────────────────────────────────────────────────────────

const SK = "acft-tracker-v1";
let state = {
  activeRoutine: null,
  currentWeek: 1,
  currentPhase: 1,
  currentDay: 0,
  routineData: {},
};
let openExIdx = null;

function loadState() {
  try {
    const raw = localStorage.getItem(SK);
    if (!raw) return;
    const loaded = JSON.parse(raw);
    // Migrate old format (sessions/benchmarks were at top level)
    if (loaded.sessions && !loaded.routineData) {
      loaded.routineData = {
        acft: {
          sessions: loaded.sessions,
          benchmarks: loaded.benchmarks || [],
          currentWeek: loaded.currentWeek || 1,
          currentPhase: loaded.currentPhase || 1,
          currentDay: loaded.currentDay || 0,
        }
      };
      loaded.activeRoutine = "acft";
      delete loaded.sessions;
      delete loaded.benchmarks;
    }
    state = { ...state, ...loaded };
  } catch(e) {}
}

function saveState(quiet) {
  try {
    localStorage.setItem(SK, JSON.stringify(state));
    if (!quiet) {
      const f = document.getElementById("save-flash");
      f.style.display = "inline";
      setTimeout(() => f.style.display = "none", 1200);
    }
  } catch(e) {}
}

// ── ROUTINE HELPERS ───────────────────────────────────────────────────────────

function getRoutine() {
  return ROUTINE_MAP[state.activeRoutine];
}

function getRoutineData() {
  if (!state.routineData[state.activeRoutine]) {
    state.routineData[state.activeRoutine] = { sessions: {}, benchmarks: [] };
  }
  return state.routineData[state.activeRoutine];
}

// ── HELPERS ───────────────────────────────────────────────────────────────────

function fmtTime(s) {
  const m = Math.floor(s / 60);
  return m + ":" + String(s % 60).padStart(2, "0");
}

function parseTime(str) {
  if (!str) return null;
  if (str.includes(":")) {
    const parts = str.split(":");
    return parseInt(parts[0]) * 60 + (parseInt(parts[1]) || 0);
  }
  return parseFloat(str);
}

function sessionKey() {
  return "p" + state.currentPhase + "-d" + state.currentDay + "-w" + state.currentWeek;
}

function getSession() {
  return (getRoutineData().sessions[sessionKey()]) || {};
}

function getExLog(idx) {
  return (getSession().exercises || {})[idx] || {};
}

function setExLog(idx, field, value) {
  const sk = sessionKey();
  const rd = getRoutineData();
  if (!rd.sessions[sk]) rd.sessions[sk] = {};
  if (!rd.sessions[sk].exercises) rd.sessions[sk].exercises = {};
  if (!rd.sessions[sk].exercises[idx]) rd.sessions[sk].exercises[idx] = {};
  rd.sessions[sk].exercises[idx][field] = value;
  saveState();
  updateProgress();
}

function getTmpl() {
  return getRoutine().weekTemplates[state.currentPhase][state.currentDay];
}

// ── PROGRAM SELECTION ─────────────────────────────────────────────────────────

function selectRoutine(id) {
  // Save current position before switching away
  if (state.activeRoutine && state.activeRoutine !== id) {
    const rd = getRoutineData();
    rd.currentWeek = state.currentWeek;
    rd.currentPhase = state.currentPhase;
    rd.currentDay = state.currentDay;
  }

  state.activeRoutine = id;
  if (!state.routineData[id]) {
    state.routineData[id] = { sessions: {}, benchmarks: [] };
  }

  const rd = state.routineData[id];

  if (rd.completed) {
    // Start a new cycle — reset position, keep history
    state.currentWeek = 1;
    state.currentPhase = 1;
    state.currentDay = 0;
    rd.completed = false;
  } else {
    state.currentWeek = rd.currentWeek || 1;
    state.currentPhase = rd.currentPhase || 1;
    state.currentDay = rd.currentDay || 0;
  }

  saveState(true);
  showApp();
}

function changeProgram() {
  // Save current position
  if (state.activeRoutine) {
    const rd = getRoutineData();
    rd.currentWeek = state.currentWeek;
    rd.currentPhase = state.currentPhase;
    rd.currentDay = state.currentDay;
  }
  state.activeRoutine = null;
  saveState(true);
  showRegistration();
}

function showRegistration() {
  document.getElementById("tab-register").classList.add("active");
  ["workout","benchmarks","history"].forEach(t => {
    document.getElementById("tab-" + t).classList.remove("active");
    document.getElementById("nav-" + t).classList.remove("active");
  });
  document.getElementById("bottom-nav").style.display = "none";
  document.getElementById("week-ctrl-wrap").style.display = "none";
  document.getElementById("header-title").textContent = "FUZZY OCTA CHAINSAW";
  document.getElementById("header-sub").textContent = "A FITNESS GOAL SETTER AND TRACKER";
  renderRegistration();
}

function showApp() {
  document.getElementById("tab-register").classList.remove("active");
  document.getElementById("bottom-nav").style.display = "flex";
  document.getElementById("week-ctrl-wrap").style.display = "block";
  document.getElementById("header-change-btn").style.display = "block";
  const r = getRoutine();
  document.getElementById("header-title").textContent = r.name;
  document.getElementById("header-sub").textContent = r.subtitle;
  document.getElementById("week-num").textContent = state.currentWeek;
  switchTab("workout");
}

function renderRegistration() {
  const container = document.getElementById("routine-list");
  container.innerHTML = "";
  ROUTINES.forEach(r => {
    const rd = state.routineData[r.id];
    const hasData = rd && Object.keys(rd.sessions || {}).length > 0;
    const isCompleted = rd && rd.completed;
    const week = rd ? (rd.currentWeek || 1) : 1;

    const card = document.createElement("div");
    card.className = "routine-card";

    let progressHtml = "";
    if (isCompleted) {
      progressHtml = `<div class="routine-progress">✓ PROGRAM COMPLETE</div>`;
    } else if (hasData) {
      progressHtml = `<div class="routine-progress">WEEK ${week} OF ${r.totalWeeks} — IN PROGRESS</div>`;
    }

    const btnLabel = isCompleted ? "TRAIN AGAIN" : (hasData ? "RESUME TRAINING" : "START TRAINING");

    card.innerHTML = `
      <div class="routine-card-header">
        <div class="routine-name">${r.name}</div>
        ${isCompleted ? '<span class="routine-badge">✓ DONE</span>' : ""}
      </div>
      <div class="routine-subtitle">${r.subtitle}</div>
      <div class="routine-desc">${r.description}</div>
      <div class="routine-meta">
        <div class="routine-meta-block">
          <span class="routine-meta-label">DURATION</span>
          <span class="routine-meta-value">${r.totalWeeks} WKS</span>
        </div>
        <div class="routine-meta-block">
          <span class="routine-meta-label">EVENTS</span>
          <span class="routine-meta-value">${r.standards.length}</span>
        </div>
        <div class="routine-meta-block">
          <span class="routine-meta-label">DAYS/WK</span>
          <span class="routine-meta-value">${r.weekTemplates[1].length}</span>
        </div>
      </div>
      ${progressHtml}
      <button class="btn-solid" onclick="selectRoutine('${r.id}')">${btnLabel}</button>
    `;
    container.appendChild(card);
  });
}

// ── WEEK CONTROL ──────────────────────────────────────────────────────────────

function changeWeek(delta) {
  if (!state.activeRoutine) return;
  const r = getRoutine();
  state.currentWeek = Math.max(1, Math.min(r.totalWeeks, state.currentWeek + delta));
  state.currentPhase = phaseForWeek(r, state.currentWeek);
  saveState();
  document.getElementById("week-num").textContent = state.currentWeek;
  renderWorkout();
}

// ── TAB SWITCHING ─────────────────────────────────────────────────────────────

function switchTab(name) {
  ["workout","benchmarks","history"].forEach(t => {
    document.getElementById("tab-" + t).classList.toggle("active", t === name);
    document.getElementById("nav-" + t).classList.toggle("active", t === name);
  });
  if (name === "benchmarks") renderBenchmarks();
  if (name === "history") renderHistory();
  if (name === "workout") renderWorkout();
}

// ── MODALS ────────────────────────────────────────────────────────────────────

function openModal(type) {
  const r = getRoutine();
  if (type === "phase") {
    const container = document.getElementById("phase-modal-items");
    container.innerHTML = "";
    r.phases.forEach(p => {
      const div = document.createElement("div");
      div.className = "modal-item" + (state.currentPhase === p.id ? " selected" : "");
      div.innerHTML = `<div><div class="modal-item-name">${p.name}</div><div class="modal-item-sub">Weeks ${p.weeks}</div></div>${state.currentPhase === p.id ? '<span class="modal-check">✓</span>' : ""}`;
      div.onclick = () => {
        state.currentPhase = p.id;
        state.currentDay = 0;
        saveState();
        closeModal("phase-modal");
        updateSelectors();
        renderWorkout();
      };
      container.appendChild(div);
    });
    document.getElementById("phase-modal").classList.add("open");
  } else {
    const container = document.getElementById("day-modal-items");
    container.innerHTML = "";
    r.weekTemplates[state.currentPhase].forEach((d, i) => {
      const div = document.createElement("div");
      div.className = "modal-item" + (state.currentDay === i ? " selected" : "");
      div.innerHTML = `<div><div class="modal-item-name">${d.day}</div><div class="modal-item-sub">${d.label}</div></div>${state.currentDay === i ? '<span class="modal-check">✓</span>' : ""}`;
      div.onclick = () => {
        state.currentDay = i;
        saveState();
        closeModal("day-modal");
        openExIdx = null;
        updateSelectors();
        renderWorkout();
      };
      container.appendChild(div);
    });
    document.getElementById("day-modal").classList.add("open");
  }
}

function closeModal(id) {
  document.getElementById(id).classList.remove("open");
}

function closeModalOutside(e, id) {
  if (e.target === document.getElementById(id)) closeModal(id);
}

// ── SELECTORS ─────────────────────────────────────────────────────────────────

function updateSelectors() {
  const r = getRoutine();
  const p = r.phases[state.currentPhase - 1];
  const d = getTmpl();
  document.getElementById("phase-label").textContent = p.name + " ▾";
  document.getElementById("day-label").textContent = d.day + " — " + d.label + " ▾";
}

// ── PROGRESS ──────────────────────────────────────────────────────────────────

function updateProgress() {
  const tmpl = getTmpl();
  const total = tmpl.exercises.length;
  const sess = getSession();
  const done = Object.values(sess.exercises || {}).filter(e => e.completed).length;
  const wrap = document.getElementById("progress-wrap");
  wrap.style.display = total > 0 ? "block" : "none";
  document.getElementById("progress-count").textContent = done + "/" + total + (done === total ? " ✓" : "");
  document.getElementById("progress-bar").style.width = ((done / total) * 100) + "%";
}

// ── WORKOUT RENDER ────────────────────────────────────────────────────────────

function renderWorkout() {
  updateSelectors();
  updateProgress();
  const tmpl = getTmpl();
  const list = document.getElementById("exercise-list");
  list.innerHTML = "";

  tmpl.exercises.forEach((ex, i) => {
    renderExRow(list, ex, i);
  });

  const sess = getSession();
  document.querySelectorAll(".feel-btn").forEach(btn => {
    btn.classList.toggle("sel", parseInt(btn.dataset.feel) === sess.feel);
  });
  document.getElementById("session-notes").value = sess.notes || "";
}

function renderExRow(container, ex, i) {
  const log = getExLog(i);
  const isOpen = openExIdx === i;

  const row = document.createElement("div");
  row.className = "ex-row" + (log.completed ? " done" : "");
  row.id = "ex-row-" + i;

  let metaParts = [];
  if (ex.sets) metaParts.push(ex.sets + " sets");
  if (ex.reps) metaParts.push("× " + ex.reps);
  if (ex.unit) metaParts.push("× " + ex.unit);

  let tagsHtml = "";
  if (!isOpen && (log.weight || log.reps || log.time || log.distance)) {
    tagsHtml = '<div class="ex-tags">';
    if (log.weight)   tagsHtml += `<span class="ex-tag">${log.weight} lbs</span>`;
    if (log.reps)     tagsHtml += `<span class="ex-tag">×${log.reps}</span>`;
    if (log.time)     tagsHtml += `<span class="ex-tag">${log.time}</span>`;
    if (log.distance) tagsHtml += `<span class="ex-tag">${log.distance}</span>`;
    tagsHtml += '</div>';
  }

  row.innerHTML = `
    <div class="ex-row-inner">
      <div class="ex-content">
        <div class="ex-name${log.completed ? " struck" : ""}">${ex.name}</div>
        <div class="ex-meta">${metaParts.join(" ")}</div>
        ${ex.note ? `<div class="ex-note">// ${ex.note}</div>` : ""}
        ${tagsHtml}
      </div>
      <div class="ex-check-wrap">
        <div class="ex-checkbox${log.completed ? " checked" : ""}" id="ex-chk-${i}">${log.completed ? "✓" : ""}</div>
        <span class="ex-arrow">${isOpen ? "▲" : "▼"}</span>
        <button class="ex-info-btn" onclick="openExInfo(${i},event)" title="How to perform">ⓘ</button>
      </div>
    </div>
  `;
  row.onclick = () => toggleEx(i);
  container.appendChild(row);

  const panel = document.createElement("div");
  panel.className = "ex-expand" + (isOpen ? " open" : "");
  panel.id = "ex-panel-" + i;
  panel.onclick = e => e.stopPropagation();

  let fieldsHtml = '<div class="field-grid">';
  if (!ex.isRun && !ex.isTime) {
    fieldsHtml += `
      <div>
        <label class="field-label">WEIGHT (lbs)</label>
        <input class="field" type="number" inputmode="numeric" placeholder="—" value="${log.weight || ""}" onchange="setExLog(${i},'weight',this.value)">
      </div>
      <div>
        <label class="field-label">REPS</label>
        <input class="field" type="number" inputmode="numeric" placeholder="—" value="${log.reps || ""}" onchange="setExLog(${i},'reps',this.value)">
      </div>
    `;
  }
  if (ex.isRun) {
    fieldsHtml += `
      <div>
        <label class="field-label">TIME (m:ss)</label>
        <input class="field" type="text" inputmode="decimal" placeholder="25:00" value="${log.time || ""}" onchange="setExLog(${i},'time',this.value)">
      </div>
      <div>
        <label class="field-label">DISTANCE</label>
        <input class="field" type="text" placeholder="2.0 mi" value="${log.distance || ""}" onchange="setExLog(${i},'distance',this.value)">
      </div>
    `;
  }
  if (ex.isTime) {
    fieldsHtml += `
      <div>
        <label class="field-label">HELD (m:ss)</label>
        <input class="field" type="text" inputmode="decimal" placeholder="1:30" value="${log.time || ""}" onchange="setExLog(${i},'time',this.value)">
      </div>
    `;
  }
  fieldsHtml += '</div>';
  fieldsHtml += `
    <div style="margin-bottom:14px;">
      <label class="field-label">NOTES</label>
      <textarea class="field" placeholder="Form, feelings, PRs..." onchange="setExLog(${i},'notes',this.value)">${log.notes || ""}</textarea>
    </div>
    <button class="${log.completed ? "btn" : "btn-solid"}" onclick="toggleComplete(${i})">
      ${log.completed ? "Mark Incomplete" : "✓ Mark Complete"}
    </button>
  `;
  panel.innerHTML = fieldsHtml;
  container.appendChild(panel);
}

function toggleEx(i) {
  openExIdx = openExIdx === i ? null : i;
  renderWorkout();
}

function toggleComplete(i) {
  const log = getExLog(i);
  setExLog(i, "completed", !log.completed);
  openExIdx = null;
  renderWorkout();
}

function setFeel(val) {
  const sk = sessionKey();
  const rd = getRoutineData();
  if (!rd.sessions[sk]) rd.sessions[sk] = {};
  rd.sessions[sk].feel = val;
  saveState();
  document.querySelectorAll(".feel-btn").forEach(btn => {
    btn.classList.toggle("sel", parseInt(btn.dataset.feel) === val);
  });
}

function updateSessionNotes(val) {
  const sk = sessionKey();
  const rd = getRoutineData();
  if (!rd.sessions[sk]) rd.sessions[sk] = {};
  rd.sessions[sk].notes = val;
  saveState();
}

// ── BENCHMARKS ────────────────────────────────────────────────────────────────

function renderBenchmarks() {
  const r = getRoutine();
  const grid = document.getElementById("standards-grid");
  grid.innerHTML = "";
  r.standards.forEach(s => {
    const card = document.createElement("div");
    card.className = "standard-card";
    const display = s.unit === "sec" ? fmtTime(s.minimum) : s.minimum;
    const unitLabel = s.unit === "sec" ? "min time" : s.unit;
    card.innerHTML = `<div class="standard-event">${s.event}</div><div class="standard-val">${display}</div><div class="standard-unit">${unitLabel}</div>`;
    grid.appendChild(card);
  });

  const formFields = document.getElementById("bench-form-fields");
  formFields.innerHTML = "";
  r.standards.forEach(s => {
    const ph = s.unit === "sec" ? fmtTime(s.minimum) : String(s.minimum);
    const unitLabel = s.unit === "sec" ? "m:ss" : s.unit;
    const div = document.createElement("div");
    div.style.marginBottom = "14px";
    div.innerHTML = `
      <label class="field-label">${s.event} (${unitLabel})</label>
      <input class="field" type="text" inputmode="decimal" placeholder="${ph}" id="bf-${s.event.replace(/\s/g,'-')}">
    `;
    formFields.appendChild(div);
  });

  renderBenchmarkHistory();
}

function toggleBenchForm() {
  const form = document.getElementById("bench-form");
  const btn = document.getElementById("log-test-btn");
  const isOpen = form.classList.contains("open");
  form.classList.toggle("open", !isOpen);
  btn.textContent = isOpen ? "+ Log Mock Test" : "Cancel";
  btn.className = isOpen ? "btn-solid" : "btn";
  if (isOpen) btn.style.marginBottom = "0";
}

function saveBenchmark() {
  const r = getRoutine();
  const entry = { date: new Date().toLocaleDateString() };
  r.standards.forEach(s => {
    const id = "bf-" + s.event.replace(/\s/g, "-");
    const el = document.getElementById(id);
    if (el && el.value) entry[s.event] = el.value;
  });
  const notesEl = document.getElementById("bench-notes");
  if (notesEl.value) entry.notes = notesEl.value;
  getRoutineData().benchmarks.push(entry);
  saveState();
  r.standards.forEach(s => {
    const el = document.getElementById("bf-" + s.event.replace(/\s/g, "-"));
    if (el) el.value = "";
  });
  notesEl.value = "";
  toggleBenchForm();
  renderBenchmarkHistory();
}

function renderBenchmarkHistory() {
  const r = getRoutine();
  const benchmarks = getRoutineData().benchmarks || [];
  const container = document.getElementById("benchmark-history");
  container.innerHTML = "";
  if (!benchmarks.length) {
    container.innerHTML = '<div class="empty">NO TESTS YET</div>';
    return;
  }
  [...benchmarks].reverse().forEach((b, i, arr) => {
    const testNum = arr.length - i;
    const card = document.createElement("div");
    card.className = "bench-card";
    let html = `<div class="bench-card-title">TEST #${testNum} — ${b.date}</div>`;
    r.standards.forEach(s => {
      const raw = b[s.event];
      if (!raw) return;
      const val = s.unit === "sec" ? parseTime(raw) : parseFloat(raw);
      if (!val) return;
      const passed = s.lowerIsBetter ? val <= s.minimum : val >= s.minimum;
      const pct = s.lowerIsBetter
        ? Math.min(100, Math.max(0, ((s.minimum - val) / (s.minimum - s.target)) * 100))
        : Math.min(100, (val / s.target) * 100);
      const display = s.unit === "sec" ? fmtTime(val) : raw;
      html += `
        <div class="bench-row">
          <span class="bench-event">${s.event}</span>
          <span class="bench-val">${display} ${passed ? "✓" : "✗"}</span>
        </div>
        <div class="bar-bg"><div class="bar-fill" style="width:${pct}%;background:${passed?"#000":"#888"}"></div></div>
        <div style="margin-bottom:10px;"></div>
      `;
    });
    if (b.notes) html += `<div class="bench-notes">${b.notes}</div>`;
    card.innerHTML = html;
    container.appendChild(card);
  });
}

// ── HISTORY ───────────────────────────────────────────────────────────────────

function renderHistory() {
  const r = getRoutine();
  const sessions = getRoutineData().sessions || {};
  const container = document.getElementById("history-list");
  container.innerHTML = "";
  const entries = Object.entries(sessions);
  if (!entries.length) {
    container.innerHTML = '<div class="empty">NO SESSIONS YET</div>';
    return;
  }
  const feels = ["💀","😓","😐","💪","🔥"];
  [...entries].reverse().forEach(([key, s]) => {
    const parts = key.match(/p(\d)-d(\d)-w(\d+)/);
    if (!parts) return;
    const [, ph, dy, wk] = parts;
    const tmpl = r.weekTemplates[ph]?.[dy];
    if (!tmpl) return;
    const exs = s.exercises || {};
    const done = Object.values(exs).filter(e => e.completed).length;

    const card = document.createElement("div");
    card.className = "hist-card";
    let html = `
      <div class="hist-header">
        <div>
          <div class="hist-title">Ph ${ph} · Wk ${wk} · ${tmpl.day}</div>
          <div class="hist-sub">${tmpl.label}</div>
        </div>
        <div>
          ${s.feel ? `<div class="hist-feel">${feels[s.feel - 1]}</div>` : ""}
          <div class="hist-done">${done} done</div>
        </div>
      </div>
    `;
    Object.entries(exs).forEach(([idx, ex]) => {
      const name = tmpl.exercises[idx]?.name;
      if (!name) return;
      html += `<div class="hist-ex${ex.completed ? "" : " incomplete"}">
        <span>${ex.completed ? "✓" : "○"} ${name}</span>
        ${ex.weight ? `<span class="hist-ex-val">${ex.weight}lbs</span>` : ""}
        ${ex.reps ? `<span>×${ex.reps}</span>` : ""}
        ${ex.time ? `<span class="hist-ex-val">${ex.time}</span>` : ""}
        ${ex.distance ? `<span>${ex.distance}</span>` : ""}
      </div>`;
    });
    if (s.notes) html += `<div class="hist-notes">${s.notes}</div>`;
    card.innerHTML = html;
    container.appendChild(card);
  });
}

// ── EXERCISE INFO OVERLAY ──────────────────────────────────────────────────────

function openExInfo(idx, e) {
  e.stopPropagation();
  const ex = getTmpl().exercises[idx];
  const info = getRoutine().exerciseInfo[ex.name];
  document.getElementById("info-ex-name").textContent = ex.name;
  document.getElementById("info-how").textContent = info
    ? info.how
    : "Perform the exercise with controlled form. Consult a trainer for technique guidance.";
  document.getElementById("info-weight").textContent = info
    ? info.weight
    : (ex.note || "Use a weight that is challenging but allows full range of motion.");
  document.getElementById("info-overlay").classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeExInfo() {
  document.getElementById("info-overlay").classList.remove("open");
  document.body.style.overflow = "";
}

function closeInfoOutside(e) {
  if (e.target === document.getElementById("info-overlay")) closeExInfo();
}

// ── AUTO-ADVANCE ───────────────────────────────────────────────────────────────

function isSessionComplete(phase, day, week) {
  if (!state.activeRoutine) return false;
  const key = "p" + phase + "-d" + day + "-w" + week;
  const sess = (getRoutineData().sessions[key]) || {};
  const tmpl = getRoutine().weekTemplates[phase]?.[day];
  if (!tmpl || tmpl.exercises.length === 0) return false;
  const done = Object.values(sess.exercises || {}).filter(e => e.completed).length;
  return done === tmpl.exercises.length;
}

function autoAdvanceWorkout() {
  if (!state.activeRoutine) return;
  const r = getRoutine();
  if (!isSessionComplete(state.currentPhase, state.currentDay, state.currentWeek)) return;

  let day = state.currentDay;
  let week = state.currentWeek;
  let phase = state.currentPhase;
  const totalDays = r.weekTemplates[phase].length;

  if (day < totalDays - 1) {
    day++;
  } else if (week < r.totalWeeks) {
    day = 0;
    week++;
    phase = phaseForWeek(r, week);
  } else {
    // Program complete — save and return to selection on next open
    const rd = getRoutineData();
    rd.currentWeek = week;
    rd.currentPhase = phase;
    rd.currentDay = day;
    rd.completed = true;
    state.activeRoutine = null;
    return;
  }

  state.currentDay = day;
  state.currentWeek = week;
  state.currentPhase = phase;
  saveState(true);
}

// Expose for HTML onclick= (module scope is not global)
Object.assign(window, {
  selectRoutine,
  changeProgram,
  changeWeek,
  switchTab,
  openModal,
  closeModalOutside,
  setFeel,
  updateSessionNotes,
  toggleBenchForm,
  saveBenchmark,
  closeExInfo,
  closeInfoOutside,
  openExInfo,
  toggleComplete,
});

// ── INIT ──────────────────────────────────────────────────────────────────────

loadState();
autoAdvanceWorkout();

if (state.activeRoutine) {
  document.getElementById("week-num").textContent = state.currentWeek;
  showApp();
} else {
  showRegistration();
}