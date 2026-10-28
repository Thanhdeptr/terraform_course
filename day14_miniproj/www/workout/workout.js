const STORAGE_PREFIX = "workout_logs_";
const STORAGE_CATALOG = "workout_catalog";
const STORAGE_SETTINGS = "workout_settings";

const DEFAULT_CATALOG = [
  { id: "bench_press", name: "Bench Press", role: "anchor", muscleGroup: "chest" },
  { id: "lat_pulldown", name: "Lat Pulldown", role: "anchor", muscleGroup: "back" },
  { id: "barbell_row", name: "Barbell Row", role: "anchor", muscleGroup: "back" },
  { id: "squat", name: "Squat", role: "anchor", muscleGroup: "legs" },
  { id: "leg_press", name: "Leg Press", role: "anchor", muscleGroup: "legs" },
  { id: "ohp", name: "Overhead Press", role: "anchor", muscleGroup: "shoulders" },
  { id: "rdl", name: "Romanian Deadlift", role: "anchor", muscleGroup: "posterior" },
  { id: "chest_fly", name: "Chest Fly", role: "isolation", muscleGroup: "chest" },
  { id: "lateral_raise", name: "Lateral Raise", role: "isolation", muscleGroup: "shoulders" },
  { id: "curl", name: "Bicep Curl", role: "isolation", muscleGroup: "arms" },
  { id: "tricep_pushdown", name: "Tricep Pushdown", role: "isolation", muscleGroup: "arms" },
  { id: "leg_curl", name: "Leg Curl", role: "isolation", muscleGroup: "legs" },
  { id: "calf_raise", name: "Calf Raise", role: "isolation", muscleGroup: "legs" }
];

const emptyLog = () => ({
  flags: { deload: false, highStress: false, poorSleep: false },
  sets: []
});

const MUSCLE_GROUPS = [
  { id: "chest", label: "Chest" },
  { id: "back", label: "Back" },
  { id: "shoulders", label: "Shoulders" },
  { id: "arms", label: "Arms" },
  { id: "legs", label: "Legs" },
  { id: "posterior", label: "Posterior" },
  { id: "core", label: "Core" }
];

let catalog = JSON.parse(localStorage.getItem(STORAGE_CATALOG)) || DEFAULT_CATALOG.map((item) => Object.assign({}, item));
let editingExerciseId = null;
let settings = JSON.parse(localStorage.getItem(STORAGE_SETTINGS)) || {
  hardSetTarget: WorkoutEngine.DEFAULT_HARD_SET_TARGET,
  plateIncrement: WorkoutEngine.DEFAULT_PLATE
};
let selectedDate = WorkoutEngine.localDateStr();
let targetRIR = 0;

const headerHardGoal = document.getElementById("header-hard-goal");
const headerPlate = document.getElementById("header-plate");
const inputHardGoal = document.getElementById("input-hard-goal");
const inputPlate = document.getElementById("input-plate");
const toggleGoalsBtn = document.getElementById("toggle-goals-btn");
const goalsDrawer = document.getElementById("goals-drawer");
const saveGoalsBtn = document.getElementById("save-goals-btn");

const totalDaysLogged = document.getElementById("total-days-logged");
const viewingDateLabel = document.getElementById("viewing-date-label");
const heatmapGrid = document.getElementById("heatmap-grid");
const monthsRow = document.getElementById("months-row");
const gridTooltip = document.getElementById("grid-tooltip");

const dayLevelBadge = document.getElementById("day-level-badge");
const dayHardCount = document.getElementById("day-hard-count");
const dayHardTarget = document.getElementById("day-hard-target");
const dayProgressBar = document.getElementById("day-progress-bar");
const liftProgressLabel = document.getElementById("lift-progress-label");
const liftE1rmCount = document.getElementById("lift-e1rm-count");
const liftE1rmTarget = document.getElementById("lift-e1rm-target");
const liftProgressBar = document.getElementById("lift-progress-bar");

const setForm = document.getElementById("set-form");
const setList = document.getElementById("set-list");
const resetDayBtn = document.getElementById("reset-day-btn");
const suggestBody = document.getElementById("suggest-body");

const customExSelect = document.getElementById("custom-ex-select");
const hiddenExInput = document.getElementById("set-exercise");
const selectedExLabel = document.getElementById("selected-ex-label");
const exOptions = document.getElementById("ex-options");

const roleSelect = document.getElementById("new-ex-role-select");
const hiddenRoleInput = document.getElementById("new-ex-role");
const roleLabel = document.getElementById("new-ex-role-label");
const muscleCombo = document.getElementById("muscle-combo");
const hiddenMuscleInput = document.getElementById("new-ex-muscle");
const muscleComboInput = document.getElementById("muscle-combo-input");
const muscleComboOptions = document.getElementById("muscle-combo-options");
const addExerciseBtn = document.getElementById("add-exercise-btn");
const exContextMenu = document.getElementById("ex-context-menu");
let contextExerciseId = null;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatKg(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return Number(n).toFixed(1).replace(/\.0$/, "");
}

function loadAllLogs() {
  const logs = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || key.indexOf(STORAGE_PREFIX) !== 0) continue;
    const dateStr = key.slice(STORAGE_PREFIX.length);
    try {
      logs[dateStr] = JSON.parse(localStorage.getItem(key));
    } catch (err) {
      logs[dateStr] = emptyLog();
    }
  }
  return logs;
}

function getLog(dateStr) {
  const raw = localStorage.getItem(`${STORAGE_PREFIX}${dateStr}`);
  if (!raw) return emptyLog();
  try {
    const parsed = JSON.parse(raw);
    return {
      flags: Object.assign(emptyLog().flags, parsed.flags || {}),
      sets: parsed.sets || []
    };
  } catch (err) {
    return emptyLog();
  }
}

function saveLog(dateStr, log) {
  localStorage.setItem(`${STORAGE_PREFIX}${dateStr}`, JSON.stringify(log));
}

function findExercise(id) {
  return catalog.find((item) => item.id === id) || null;
}

function persistCatalog() {
  localStorage.setItem(STORAGE_CATALOG, JSON.stringify(catalog));
}

function muscleLabel(id) {
  const found = MUSCLE_GROUPS.find((g) => g.id === id);
  if (found) return found.label;
  if (!id) return "";
  return id.charAt(0).toUpperCase() + id.slice(1);
}

function muscleChoices() {
  const ids = MUSCLE_GROUPS.map((g) => g.id);
  catalog.forEach((item) => {
    if (item.muscleGroup && ids.indexOf(item.muscleGroup) === -1) ids.push(item.muscleGroup);
  });
  return ids.map((id) => ({ id, label: muscleLabel(id) }));
}

function setMuscleValue(id) {
  const choice = muscleChoices().find((g) => g.id === id) || MUSCLE_GROUPS[0];
  hiddenMuscleInput.value = choice.id;
  muscleComboInput.value = choice.label;
}

function renderMuscleOptions(filter) {
  const q = (filter || "").trim().toLowerCase();
  const matches = muscleChoices().filter((g) => {
    return g.label.toLowerCase().indexOf(q) !== -1 || g.id.toLowerCase().indexOf(q) !== -1;
  });
  if (!matches.length) {
    muscleComboOptions.innerHTML = `<div class="custom-option-group">No match</div>`;
    return;
  }
  muscleComboOptions.innerHTML = matches.map((g) => {
    const selected = g.id === hiddenMuscleInput.value ? " selected" : "";
    return `<div class="custom-option${selected}" data-value="${escapeHtml(g.id)}">${escapeHtml(g.label)}</div>`;
  }).join("");
  muscleComboOptions.querySelectorAll(".custom-option").forEach((option) => {
    option.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      setMuscleValue(option.dataset.value);
      muscleCombo.classList.remove("open");
    });
  });
}

function setRoleValue(role) {
  const next = role === "isolation" ? "isolation" : "anchor";
  hiddenRoleInput.value = next;
  roleLabel.textContent = next === "isolation" ? "Isolation" : "Anchor";
  roleSelect.querySelectorAll(".custom-option").forEach((opt) => {
    opt.classList.toggle("selected", opt.dataset.value === next);
  });
}

function resetExerciseForm() {
  editingExerciseId = null;
  document.getElementById("new-ex-name").value = "";
  setRoleValue("anchor");
  setMuscleValue("chest");
  addExerciseBtn.textContent = "Add Lift";
}

function hideContextMenu() {
  exContextMenu.hidden = true;
  contextExerciseId = null;
}

function showContextMenu(event, exerciseId) {
  event.preventDefault();
  event.stopPropagation();
  contextExerciseId = exerciseId;
  exContextMenu.hidden = false;
  const menuW = 160;
  const x = Math.min(event.clientX, window.innerWidth - menuW - 8);
  const y = Math.min(event.clientY, window.innerHeight - 90);
  exContextMenu.style.left = `${x}px`;
  exContextMenu.style.top = `${y}px`;
}

function rewriteExerciseMeta(exercise) {
  const logs = loadAllLogs();
  Object.keys(logs).forEach((dateStr) => {
    let changed = false;
    (logs[dateStr].sets || []).forEach((set) => {
      if (set.exerciseId !== exercise.id) return;
      set.name = exercise.name;
      set.role = exercise.role;
      set.muscleGroup = exercise.muscleGroup;
      changed = true;
    });
    if (changed) saveLog(dateStr, logs[dateStr]);
  });
}

function startEditExercise(id) {
  const exercise = findExercise(id);
  if (!exercise) return;
  hideContextMenu();
  editingExerciseId = id;
  document.getElementById("new-ex-name").value = exercise.name;
  setRoleValue(exercise.role);
  setMuscleValue(exercise.muscleGroup);
  addExerciseBtn.textContent = "Save Lift";
  goalsDrawer.style.display = "block";
  document.getElementById("new-ex-name").focus();
}

function deleteExercise(id) {
  hideContextMenu();
  const exercise = findExercise(id);
  if (!exercise) return;
  if (catalog.length <= 1) {
    alert("Keep at least one exercise in the catalog.");
    return;
  }
  if (!confirm(`Delete ${exercise.name} from the catalog?`)) return;
  catalog = catalog.filter((item) => item.id !== id);
  persistCatalog();
  if (hiddenExInput.value === id) hiddenExInput.value = catalog[0].id;
  if (editingExerciseId === id) resetExerciseForm();
  renderExerciseOptions();
  updateSuggest();
  updateLiftProgress();
}

function lastWorkingSet(exerciseId, logsByDate) {
  const todayLog = logsByDate[selectedDate];
  if (todayLog) {
    const todaySets = todayLog.sets.filter((s) => s.exerciseId === exerciseId && !s.isWarmup);
    if (todaySets.length) return todaySets[todaySets.length - 1];
  }
  const dates = Object.keys(logsByDate).filter((d) => d < selectedDate).sort();
  for (let i = dates.length - 1; i >= 0; i--) {
    const sets = (logsByDate[dates[i]].sets || []).filter((s) => s.exerciseId === exerciseId && !s.isWarmup);
    if (sets.length) return sets[sets.length - 1];
  }
  return null;
}

function bindCustomSelect(wrapper, hidden, labelEl) {
  const trigger = wrapper.querySelector(".custom-select-trigger");
  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    document.querySelectorAll(".custom-select-wrapper.open").forEach((el) => {
      if (el !== wrapper) el.classList.remove("open");
    });
    wrapper.classList.toggle("open");
  });
  wrapper.querySelectorAll(".custom-option").forEach((option) => {
    option.addEventListener("click", (e) => {
      e.stopPropagation();
      wrapper.querySelectorAll(".custom-option").forEach((opt) => opt.classList.remove("selected"));
      option.classList.add("selected");
      hidden.value = option.dataset.value;
      labelEl.textContent = option.textContent;
      wrapper.classList.remove("open");
    });
  });
}

function renderExerciseOptions() {
  const anchors = catalog.filter((item) => item.role === "anchor");
  const isolations = catalog.filter((item) => item.role === "isolation");
  let html = "";
  if (anchors.length) {
    html += `<div class="custom-option-group">Anchor</div>`;
    anchors.forEach((item) => {
      html += `<div class="custom-option" data-value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</div>`;
    });
  }
  if (isolations.length) {
    html += `<div class="custom-option-group">Isolation</div>`;
    isolations.forEach((item) => {
      html += `<div class="custom-option" data-value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</div>`;
    });
  }
  exOptions.innerHTML = html;

  const current = findExercise(hiddenExInput.value);
  if (!current && catalog[0]) {
    hiddenExInput.value = catalog[0].id;
    selectedExLabel.textContent = catalog[0].name;
  } else if (current) {
    selectedExLabel.textContent = current.name;
  }

  exOptions.querySelectorAll(".custom-option").forEach((option) => {
    if (option.dataset.value === hiddenExInput.value) option.classList.add("selected");
    option.addEventListener("click", (e) => {
      e.stopPropagation();
      hideContextMenu();
      exOptions.querySelectorAll(".custom-option").forEach((opt) => opt.classList.remove("selected"));
      option.classList.add("selected");
      hiddenExInput.value = option.dataset.value;
      selectedExLabel.textContent = option.textContent;
      customExSelect.classList.remove("open");
      prefillFromLastSet();
      updateSuggest();
      updateLiftProgress();
    });
    option.addEventListener("contextmenu", (e) => {
      showContextMenu(e, option.dataset.value);
    });
  });
}

function prefillFromLastSet() {
  const last = lastWorkingSet(hiddenExInput.value, loadAllLogs());
  if (!last) return;
  const weightEl = document.getElementById("set-weight");
  const repsEl = document.getElementById("set-reps");
  if (!weightEl.value) weightEl.value = last.weight;
  if (!repsEl.value) repsEl.value = last.reps;
}

function syncSettingsDisplays() {
  headerHardGoal.textContent = settings.hardSetTarget;
  headerPlate.textContent = settings.plateIncrement;
  inputHardGoal.value = settings.hardSetTarget;
  inputPlate.value = settings.plateIncrement;
  dayHardTarget.textContent = settings.hardSetTarget;
}

function hypotheticalSet() {
  const exercise = findExercise(hiddenExInput.value);
  if (!exercise) return null;
  const weight = Number(document.getElementById("set-weight").value);
  const reps = Number(document.getElementById("set-reps").value);
  const rir = Number(document.getElementById("set-rir").value);
  if (!weight || !reps || Number.isNaN(rir)) return null;
  return {
    exerciseId: exercise.id,
    name: exercise.name,
    role: exercise.role,
    muscleGroup: exercise.muscleGroup,
    weight,
    reps,
    rir
  };
}

function updateSuggest() {
  const exercise = findExercise(hiddenExInput.value);
  if (!exercise) {
    suggestBody.textContent = "Pick a lift to see the next overload target.";
    return;
  }

  const logs = loadAllLogs();
  const log = getLog(selectedDate);
  const extra = hypotheticalSet();
  const currentScore = WorkoutEngine.scoreDay(selectedDate, log, logs, settings.hardSetTarget);
  const nextScore = extra
    ? WorkoutEngine.scoreWithHypothetical(selectedDate, log, logs, settings.hardSetTarget, extra)
    : currentScore;

  if (exercise.role === "isolation") {
    const hardNow = WorkoutEngine.countHardSets(log);
    const hardNext = extra && WorkoutEngine.isHardSet(extra) ? hardNow + 1 : hardNow;
    const remain = Math.max(0, settings.hardSetTarget - hardNext);
    suggestBody.innerHTML = `
      Isolation — e1RM is not tracked.<br>
      Hard sets ${hardNext} / ${settings.hardSetTarget}${remain ? ` · ${remain} more for Volume Done` : " · volume target hit"}.
      ${nextScore.level !== currentScore.level ? `<br>If you log this → ${escapeHtml(currentScore.label)} → ${escapeHtml(nextScore.label)}` : ""}
    `;
    return;
  }

  const baseline = WorkoutEngine.baselineE1rm(exercise.id, selectedDate, logs);
  const weight = Number(document.getElementById("set-weight").value);
  const reps = Number(document.getElementById("set-reps").value);
  const suggestion = WorkoutEngine.suggest(weight, reps, targetRIR, baseline, settings.plateIncrement);

  if (suggestion.initializing) {
    suggestBody.innerHTML = `
      First logged session for <strong>${escapeHtml(exercise.name)}</strong>.
      Today's heaviest clean set becomes the baseline — this day maxes at Active or Volume, not Overload.
      ${nextScore.level !== currentScore.level ? `<br>If you log this → ${escapeHtml(currentScore.label)} → ${escapeHtml(nextScore.label)}` : ""}
    `;
    return;
  }

  const todayBest = WorkoutEngine.todayBestE1rm(exercise.id, log);
  if (todayBest >= suggestion.targetE1RM) {
    suggestBody.innerHTML = `Overload already hit for ${escapeHtml(exercise.name)} (${formatKg(todayBest)} kg e1RM ≥ ${formatKg(suggestion.targetE1RM)} kg).`;
    return;
  }

  const lines = [];
  if (suggestion.targetReps != null && weight) {
    const deltaReps = suggestion.targetReps - (reps || 0);
    lines.push(`Keep ${formatKg(weight)} kg → <strong>${suggestion.targetReps} reps</strong>${deltaReps > 0 ? ` (+${deltaReps})` : ""} @ RIR ${targetRIR}`);
  }
  if (suggestion.targetWeight != null && reps) {
    const deltaW = suggestion.targetWeight - (weight || 0);
    lines.push(`Keep ${reps} reps → <strong>${formatKg(suggestion.targetWeight)} kg</strong>${deltaW > 0 ? ` (+${formatKg(deltaW)} kg)` : ""} @ RIR ${targetRIR}`);
  }
  if (extra && WorkoutEngine.isRecordableSet(extra)) {
    const predicted = WorkoutEngine.e1rm(extra.weight, extra.reps, extra.rir);
    lines.push(`This set e1RM: ${formatKg(predicted)} kg · target ${formatKg(suggestion.targetE1RM)} kg`);
  }
  if (nextScore.level !== currentScore.level) {
    lines.push(`If you log this → ${currentScore.label} → ${nextScore.label}`);
  }
  suggestBody.innerHTML = lines.join("<br>") || "Enter weight and reps for a live target.";
}

function updateLiftProgress() {
  const exercise = findExercise(hiddenExInput.value);
  const logs = loadAllLogs();
  const log = getLog(selectedDate);

  if (!exercise || exercise.role !== "anchor") {
    liftProgressLabel.textContent = exercise ? `${exercise.name} (isolation)` : "Lift e1RM";
    liftE1rmCount.textContent = "—";
    liftE1rmTarget.textContent = "—";
    liftProgressBar.style.width = "0%";
    return;
  }

  const baseline = WorkoutEngine.baselineE1rm(exercise.id, selectedDate, logs);
  const todayBest = WorkoutEngine.todayBestE1rm(exercise.id, log);
  liftProgressLabel.textContent = `${exercise.name} e1RM`;

  if (baseline <= 0) {
    liftE1rmCount.textContent = todayBest ? `${formatKg(todayBest)} kg` : "—";
    liftE1rmTarget.textContent = "baseline init";
    liftProgressBar.style.width = todayBest ? "33%" : "0%";
    return;
  }

  const target = baseline * WorkoutEngine.OVERLOAD_FACTOR;
  liftE1rmCount.textContent = todayBest ? `${formatKg(todayBest)} kg` : "0 kg";
  liftE1rmTarget.textContent = `${formatKg(target)} kg`;
  const pct = Math.min((todayBest / target) * 100, 100);
  liftProgressBar.style.width = `${pct}%`;
}

function renderYearHeatmap() {
  heatmapGrid.innerHTML = "";
  monthsRow.innerHTML = "";

  const logs = loadAllLogs();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const totalDays = 52 * 7;
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - totalDays + 1);

  let loggedCount = 0;
  let lastRenderedMonth = -1;
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  for (let i = 0; i < totalDays; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    const dateStr = WorkoutEngine.localDateStr(d);
    const currentMonth = d.getMonth();
    const weekIndex = Math.floor(i / 7);

    if (currentMonth !== lastRenderedMonth && d.getDay() === 1) {
      const monthSpan = document.createElement("span");
      monthSpan.className = "month-label-item";
      monthSpan.textContent = monthNames[currentMonth];
      monthSpan.style.left = `${weekIndex * 12.5}px`;
      monthsRow.appendChild(monthSpan);
      lastRenderedMonth = currentMonth;
    }

    const log = logs[dateStr];
    const score = WorkoutEngine.scoreDay(dateStr, log, logs, settings.hardSetTarget);
    if (WorkoutEngine.hasWorkingSet(log)) loggedCount++;

    const cell = document.createElement("div");
    cell.className = `day-cell ${score.className}`;
    if (dateStr === selectedDate) cell.classList.add("active-selected");

    cell.addEventListener("mouseenter", (e) => {
      const hard = WorkoutEngine.countHardSets(log);
      const flags = log && log.flags ? log.flags : {};
      const flagBits = [
        flags.deload ? "Deload" : "",
        flags.highStress ? "Stress" : "",
        flags.poorSleep ? "Poor sleep" : ""
      ].filter(Boolean);
      gridTooltip.style.display = "block";
      gridTooltip.innerHTML = `
        <strong>${dateStr}</strong><br>
        ${score.label}<br>
        Hard sets: ${hard}${flagBits.length ? `<br>${flagBits.join(" · ")}` : ""}
      `;
      gridTooltip.style.left = `${e.pageX + 12}px`;
      gridTooltip.style.top = `${e.pageY - 38}px`;
    });
    cell.addEventListener("mouseleave", () => {
      gridTooltip.style.display = "none";
    });
    cell.addEventListener("click", () => {
      selectedDate = dateStr;
      document.querySelectorAll(".day-cell").forEach((c) => c.classList.remove("active-selected"));
      cell.classList.add("active-selected");
      updateActiveDayView();
    });

    heatmapGrid.appendChild(cell);
  }

  totalDaysLogged.textContent = `${loggedCount} sessions this year`;
}

function updateActiveDayView() {
  const isToday = selectedDate === WorkoutEngine.localDateStr();
  viewingDateLabel.textContent = isToday ? `Today (${selectedDate})` : selectedDate;

  const logs = loadAllLogs();
  const log = getLog(selectedDate);
  const score = WorkoutEngine.scoreDay(selectedDate, log, logs, settings.hardSetTarget);
  const hard = WorkoutEngine.countHardSets(log);

  dayLevelBadge.textContent = score.label;
  dayLevelBadge.className = `level-badge ${score.className}`;
  dayHardCount.textContent = hard;
  dayHardTarget.textContent = settings.hardSetTarget;
  dayProgressBar.style.width = `${score.percent}%`;
  dayProgressBar.className = `progress-fill fill-wo ${score.level === 4 ? "is-pr" : ""}`;

  document.querySelectorAll(".flag-chip").forEach((chip) => {
    chip.classList.toggle("active", !!log.flags[chip.dataset.flag]);
  });

  setList.innerHTML = "";
  if (!log.sets.length) {
    setList.innerHTML = `<div class="empty-row">No sets logged for this date.</div>`;
  } else {
    const groups = [];
    const groupIndex = {};
    log.sets.forEach((set, idx) => {
      const key = set.exerciseId || set.name;
      if (groupIndex[key] == null) {
        groupIndex[key] = groups.length;
        groups.push({
          name: set.name,
          role: set.role,
          items: []
        });
      }
      groups[groupIndex[key]].items.push({ set, idx });
    });

    groups.forEach((group) => {
      const panel = document.createElement("div");
      panel.className = "suggest-panel lift-group";
      const role = group.role === "anchor" ? "Anchor" : "Isolation";
      panel.innerHTML = `
        <div class="suggest-header">
          <span>${escapeHtml(role)} · ${escapeHtml(group.name)}</span>
          <span>${group.items.length} set${group.items.length > 1 ? "s" : ""}</span>
        </div>
        <ul class="lift-set-rows"></ul>
      `;
      const rows = panel.querySelector(".lift-set-rows");
      group.items.forEach((item, setNo) => {
        const e1 = WorkoutEngine.setE1rm(item.set);
        const hard = WorkoutEngine.isHardSet(item.set);
        const li = document.createElement("li");
        li.className = "lift-set-row";
        li.innerHTML = `
          <span class="set-num">Set ${setNo + 1}</span>
          <span class="set-meta">${item.set.weight} kg × ${item.set.reps} @ RIR ${item.set.rir}${e1 != null ? ` · e1RM ${formatKg(e1)}` : ""}${hard ? " · Hard" : ""}</span>
          <button class="delete-btn" type="button">Delete</button>
        `;
        li.querySelector(".delete-btn").addEventListener("click", () => removeSet(item.idx));
        rows.appendChild(li);
      });
      setList.appendChild(panel);
    });
  }

  updateLiftProgress();
  updateSuggest();
}

function refreshAll() {
  renderYearHeatmap();
  updateActiveDayView();
}

window.removeSet = function (index) {
  const log = getLog(selectedDate);
  log.sets.splice(index, 1);
  if (!log.sets.length && !log.flags.deload && !log.flags.highStress && !log.flags.poorSleep) {
    localStorage.removeItem(`${STORAGE_PREFIX}${selectedDate}`);
  } else {
    saveLog(selectedDate, log);
  }
  refreshAll();
};

customExSelect.querySelector(".custom-select-trigger").addEventListener("click", (e) => {
  e.stopPropagation();
  hideContextMenu();
  document.querySelectorAll(".custom-select-wrapper.open").forEach((el) => {
    if (el !== customExSelect) el.classList.remove("open");
  });
  muscleCombo.classList.remove("open");
  customExSelect.classList.toggle("open");
});

customExSelect.querySelector(".custom-select-trigger").addEventListener("contextmenu", (e) => {
  if (hiddenExInput.value) showContextMenu(e, hiddenExInput.value);
});

bindCustomSelect(roleSelect, hiddenRoleInput, roleLabel);

muscleComboInput.addEventListener("focus", (e) => {
  e.stopPropagation();
  muscleCombo.classList.add("open");
  renderMuscleOptions(muscleComboInput.value === muscleLabel(hiddenMuscleInput.value) ? "" : muscleComboInput.value);
});

muscleComboInput.addEventListener("click", (e) => {
  e.stopPropagation();
  muscleCombo.classList.add("open");
});

muscleComboInput.addEventListener("input", () => {
  muscleCombo.classList.add("open");
  renderMuscleOptions(muscleComboInput.value);
});

muscleComboInput.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    setMuscleValue(hiddenMuscleInput.value);
    muscleCombo.classList.remove("open");
    return;
  }
  if (e.key === "Enter") {
    e.preventDefault();
    const first = muscleComboOptions.querySelector(".custom-option");
    if (first) setMuscleValue(first.dataset.value);
    else setMuscleValue(hiddenMuscleInput.value);
    muscleCombo.classList.remove("open");
  }
});

muscleComboInput.addEventListener("blur", () => {
  setTimeout(() => {
    setMuscleValue(hiddenMuscleInput.value);
    muscleCombo.classList.remove("open");
  }, 120);
});

exContextMenu.addEventListener("click", (e) => e.stopPropagation());

exContextMenu.querySelector("[data-action=edit]").addEventListener("click", () => {
  if (contextExerciseId) startEditExercise(contextExerciseId);
});

exContextMenu.querySelector("[data-action=delete]").addEventListener("click", () => {
  if (contextExerciseId) deleteExercise(contextExerciseId);
});

document.addEventListener("click", () => {
  document.querySelectorAll(".custom-select-wrapper.open").forEach((el) => el.classList.remove("open"));
  muscleCombo.classList.remove("open");
  hideContextMenu();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") hideContextMenu();
});

document.querySelectorAll(".flag-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    const log = getLog(selectedDate);
    const key = chip.dataset.flag;
    log.flags[key] = !log.flags[key];
    saveLog(selectedDate, log);
    refreshAll();
  });
});

document.querySelectorAll(".rir-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".rir-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    targetRIR = Number(btn.dataset.rir);
    updateSuggest();
  });
});

["set-weight", "set-reps", "set-rir"].forEach((id) => {
  document.getElementById(id).addEventListener("input", updateSuggest);
  document.getElementById(id).addEventListener("change", updateSuggest);
});

setForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const extra = hypotheticalSet();
  if (!extra) return;
  const log = getLog(selectedDate);
  log.sets.push(extra);
  saveLog(selectedDate, log);
  document.getElementById("set-weight").value = extra.weight;
  document.getElementById("set-reps").value = extra.reps;
  refreshAll();
});

resetDayBtn.addEventListener("click", () => {
  if (confirm(`Clear all workout records for ${selectedDate}?`)) {
    localStorage.removeItem(`${STORAGE_PREFIX}${selectedDate}`);
    refreshAll();
  }
});

toggleGoalsBtn.addEventListener("click", () => {
  goalsDrawer.style.display = goalsDrawer.style.display === "none" ? "block" : "none";
});

saveGoalsBtn.addEventListener("click", () => {
  settings.hardSetTarget = Number(inputHardGoal.value) || WorkoutEngine.DEFAULT_HARD_SET_TARGET;
  settings.plateIncrement = Number(inputPlate.value) || WorkoutEngine.DEFAULT_PLATE;
  localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(settings));
  syncSettingsDisplays();
  goalsDrawer.style.display = "none";
  refreshAll();
});

addExerciseBtn.addEventListener("click", () => {
  const name = document.getElementById("new-ex-name").value.trim();
  const muscle = hiddenMuscleInput.value || "chest";
  const role = hiddenRoleInput.value === "isolation" ? "isolation" : "anchor";
  if (!name) return;
  if (editingExerciseId) {
    const exercise = findExercise(editingExerciseId);
    if (!exercise) return;
    exercise.name = name;
    exercise.role = role;
    exercise.muscleGroup = muscle;
    persistCatalog();
    rewriteExerciseMeta(exercise);
    hiddenExInput.value = exercise.id;
    resetExerciseForm();
  } else {
    const id = `custom_${Date.now()}`;
    catalog.push({ id, name, role, muscleGroup: muscle });
    persistCatalog();
    hiddenExInput.value = id;
    document.getElementById("new-ex-name").value = "";
    setMuscleValue(muscle);
  }
  renderExerciseOptions();
  updateSuggest();
  updateLiftProgress();
  refreshAll();
});

renderExerciseOptions();
setMuscleValue("chest");
syncSettingsDisplays();
prefillFromLastSet();
refreshAll();
