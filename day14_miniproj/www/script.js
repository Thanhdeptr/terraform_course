const STORAGE_PREFIX = "nutrition_logs_";
const STORAGE_GOALS = "nutrition_goals";

function localDateStr(d) {
  const date = d ? new Date(d) : new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function heatmapRange() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - 52 * 7 + 1);
  return { from: localDateStr(startDate), to: localDateStr(today) };
}

const DEFAULT_GOALS = { calories: 2000, protein: 120 };
let goals = Object.assign({}, DEFAULT_GOALS);

let selectedDate = localDateStr();
let mealsByDate = {};

const headerCalGoal = document.getElementById("header-cal-goal");
const headerProGoal = document.getElementById("header-pro-goal");
const inputCalGoal = document.getElementById("input-cal-goal");
const inputProGoal = document.getElementById("input-pro-goal");
const toggleGoalsBtn = document.getElementById("toggle-goals-btn");
const goalsDrawer = document.getElementById("goals-drawer");
const saveGoalsBtn = document.getElementById("save-goals-btn");

const totalDaysLogged = document.getElementById("total-days-logged");
const viewingDateLabel = document.getElementById("viewing-date-label");
const dayCalCount = document.getElementById("day-cal-count");
const dayCalTarget = document.getElementById("day-cal-target");
const dayProCount = document.getElementById("day-pro-count");
const dayProTarget = document.getElementById("day-pro-target");
const calProgressBar = document.getElementById("cal-progress-bar");
const proProgressBar = document.getElementById("pro-progress-bar");

const heatmapGrid = document.getElementById("heatmap-grid");
const monthsRow = document.getElementById("months-row");
const gridTooltip = document.getElementById("grid-tooltip");

const mealForm = document.getElementById("meal-form");
const mealList = document.getElementById("meal-list");
const resetDayBtn = document.getElementById("reset-day-btn");

const customSelect = document.getElementById("custom-meal-select");
const selectTrigger = customSelect.querySelector(".custom-select-trigger");
const selectedMealLabel = document.getElementById("selected-meal-label");
const hiddenMealInput = document.getElementById("meal-type");
const customOptions = customSelect.querySelectorAll(".custom-option");

const estimateDescription = document.getElementById("estimate-description");
const estimateBtn = document.getElementById("estimate-btn");
const estimateError = document.getElementById("estimate-error");
const estimateResult = document.getElementById("estimate-result");
const estimateResultName = document.getElementById("estimate-result-name");
const estimateResultMacros = document.getElementById("estimate-result-macros");
const estimateResultItems = document.getElementById("estimate-result-items");
const estimateArrowBtn = document.getElementById("estimate-arrow-btn");
const estimatePanel = document.getElementById("estimate-panel");
const estimateBackdrop = document.getElementById("estimate-backdrop");
const estimateOpenBtn = document.getElementById("estimate-open-btn");
const estimateFab = document.getElementById("estimate-fab");
const estimateCloseBtn = document.getElementById("estimate-close-btn");
const estimateSuggestions = document.getElementById("estimate-suggestions");
const estimatePinBtn = document.getElementById("estimate-pin-btn");
const estimatePinsList = document.getElementById("estimate-pins-list");
const estimatePinsEmpty = document.getElementById("estimate-pins-empty");

const MEAL_TYPES = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack"
};

let latestEstimate = null;
let pinnedMeals = [];
let latestPinId = null;

function round1(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 10) / 10;
}

function setMealCategory(category) {
  const val = MEAL_TYPES[String(category || "").toLowerCase()] || category || "Lunch";
  hiddenMealInput.value = val;
  selectedMealLabel.textContent = val;
  customOptions.forEach((opt) => {
    opt.classList.toggle("selected", opt.dataset.value === val);
  });
}

function openEstimatePanel() {
  document.body.classList.add("estimate-open");
  if (estimateBackdrop) estimateBackdrop.hidden = false;
  if (estimatePanel) estimatePanel.setAttribute("aria-hidden", "false");
  if (estimateDescription) estimateDescription.focus();
  refreshPins();
}

function setPinButtonState(pinned) {
  if (!estimatePinBtn) return;
  estimatePinBtn.classList.toggle("is-pinned", !!pinned);
  estimatePinBtn.setAttribute("aria-pressed", pinned ? "true" : "false");
  estimatePinBtn.title = pinned ? "Pinned" : "Pin this meal";
}

function fillMealFormFromPin(pin) {
  if (!pin) return;
  setMealCategory(pin.type);
  document.getElementById("meal-name").value = pin.name || "";
  document.getElementById("meal-cal").value = String(pin.calories != null ? pin.calories : "");
  document.getElementById("meal-pro").value = String(round1(pin.protein));
  document.getElementById("meal-carbs").value = String(round1(pin.carbs));
  document.getElementById("meal-fat").value = String(round1(pin.fat));
}

function renderPins() {
  if (!estimatePinsList) return;
  estimatePinsList.innerHTML = "";
  if (estimatePinsEmpty) estimatePinsEmpty.hidden = pinnedMeals.length > 0;
  pinnedMeals.forEach((pin) => {
    const card = document.createElement("div");
    card.className = "estimate-pin-card";
    card.innerHTML = `
      <strong></strong>
      <span></span>
      <button type="button" class="estimate-pin-remove" title="Unpin" aria-label="Unpin">×</button>
    `;
    card.querySelector("strong").textContent = pin.name || "Pinned meal";
    card.querySelector("span").textContent =
      `${pin.type || "Snack"} · ${pin.calories || 0} kcal | ${round1(pin.protein)}g P | ${round1(pin.carbs)}g C | ${round1(pin.fat)}g F`;
    card.addEventListener("click", (e) => {
      if (e.target.closest(".estimate-pin-remove")) return;
      fillMealFormFromPin(pin);
      closeEstimatePanel();
    });
    card.querySelector(".estimate-pin-remove").addEventListener("click", async (e) => {
      e.stopPropagation();
      await unpinMeal(pin.id);
    });
    estimatePinsList.appendChild(card);
  });
}

async function refreshPins() {
  if (!CommitFitApi.enabled() || !CommitFitApi.currentUser()) {
    pinnedMeals = [];
    renderPins();
    return;
  }
  try {
    const data = await CommitFitApi.api("/pins");
    pinnedMeals = data.items || [];
  } catch (err) {
    pinnedMeals = [];
  }
  renderPins();
}

async function unpinMeal(id) {
  if (!id || !CommitFitApi.enabled()) return;
  try {
    await CommitFitApi.api(`/pins/${encodeURIComponent(id)}`, { method: "DELETE" });
    pinnedMeals = pinnedMeals.filter((p) => p.id !== id);
    if (latestPinId === id) {
      latestPinId = null;
      setPinButtonState(false);
    }
    renderPins();
  } catch (err) {
    showEstimateError((err && err.message) || "Could not unpin meal");
  }
}

function getReadyToLogName() {
  const typed = estimateResultName && estimateResultName.value != null
    ? String(estimateResultName.value).trim()
    : "";
  if (typed) return typed.slice(0, 120);
  const fromDescription = estimateDescription
    ? String(estimateDescription.value || "").trim()
    : "";
  if (fromDescription) return fromDescription.slice(0, 120);
  return (latestEstimate && latestEstimate.name) || "Meal";
}

async function pinLatestEstimate() {
  if (!latestEstimate) return;
  if (!CommitFitApi.enabled() || !CommitFitApi.currentUser()) {
    showEstimateError("Sign in to pin meals.");
    const authOpen = document.getElementById("auth-open-btn");
    if (authOpen) authOpen.click();
    return;
  }
  if (latestPinId) return;
  const mealName = getReadyToLogName();
  if (!mealName) {
    showEstimateError("Enter a meal name before pinning.");
    if (estimateResultName) estimateResultName.focus();
    return;
  }
  const duplicate = pinnedMeals.find(
    (p) =>
      p.name === mealName &&
      Number(p.calories) === Number(latestEstimate.cal) &&
      Number(p.protein) === Number(latestEstimate.pro)
  );
  if (duplicate) {
    latestPinId = duplicate.id;
    setPinButtonState(true);
    return;
  }
  try {
    const saved = await CommitFitApi.api("/pins", {
      method: "POST",
      body: {
        type: latestEstimate.type,
        name: mealName,
        calories: latestEstimate.cal,
        protein: latestEstimate.pro,
        carbs: latestEstimate.carb,
        fat: latestEstimate.fat,
        items: latestEstimate.items || []
      }
    });
    latestPinId = saved.id;
    pinnedMeals = [saved].concat(pinnedMeals);
    setPinButtonState(true);
    renderPins();
  } catch (err) {
    showEstimateError((err && err.message) || "Could not pin meal");
  }
}

if (estimatePinBtn) {
  estimatePinBtn.addEventListener("click", () => {
    pinLatestEstimate();
  });
}

function closeEstimatePanel() {
  document.body.classList.remove("estimate-open");
  if (estimateBackdrop) estimateBackdrop.hidden = true;
  if (estimatePanel) estimatePanel.setAttribute("aria-hidden", "true");
}

if (estimateOpenBtn) estimateOpenBtn.addEventListener("click", openEstimatePanel);
if (estimateFab) estimateFab.addEventListener("click", openEstimatePanel);
if (estimateCloseBtn) estimateCloseBtn.addEventListener("click", closeEstimatePanel);
if (estimateBackdrop) estimateBackdrop.addEventListener("click", closeEstimatePanel);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && document.body.classList.contains("estimate-open")) {
    closeEstimatePanel();
  }
});

if (estimateSuggestions) {
  estimateSuggestions.querySelectorAll("[data-estimate-prompt]").forEach((card) => {
    card.addEventListener("click", () => {
      if (!estimateDescription) return;
      estimateDescription.value = card.getAttribute("data-estimate-prompt") || "";
      estimateDescription.focus();
      showEstimateError("");
    });
  });
}

selectTrigger.addEventListener("click", (e) => {
  e.stopPropagation();
  customSelect.classList.toggle("open");
});

customOptions.forEach(option => {
  option.addEventListener("click", (e) => {
    e.stopPropagation();
    setMealCategory(option.dataset.value);
    customSelect.classList.remove("open");
  });
});

document.addEventListener("click", () => {
  customSelect.classList.remove("open");
});

function showEstimateError(message) {
  if (!message) {
    estimateError.hidden = true;
    estimateError.textContent = "";
    return;
  }
  estimateError.hidden = false;
  estimateError.textContent = message;
}

function renderEstimate(result) {
  latestEstimate = result;
  latestPinId = null;
  setPinButtonState(false);
  const hero = document.getElementById("estimate-hero");
  const pinsBlock = document.getElementById("estimate-pins");
  if (!result) {
    estimateResult.hidden = true;
    estimateArrowBtn.disabled = true;
    if (estimateResultName) estimateResultName.value = "";
    if (hero) hero.hidden = false;
    if (estimateSuggestions) estimateSuggestions.hidden = false;
    if (pinsBlock) pinsBlock.hidden = false;
    return;
  }
  estimateResult.hidden = false;
  estimateArrowBtn.disabled = false;
  if (hero) hero.hidden = true;
  if (estimateSuggestions) estimateSuggestions.hidden = true;
  if (pinsBlock) pinsBlock.hidden = false;
  const fromUser = estimateDescription
    ? String(estimateDescription.value || "").trim().slice(0, 120)
    : "";
  if (estimateResultName) {
    estimateResultName.value = fromUser || result.name || "";
  }
  estimateResultMacros.textContent = `${result.cal || 0} kcal | ${round1(result.pro)}g P | ${round1(result.carb)}g C | ${round1(result.fat)}g F`;
  estimateResultItems.innerHTML = "";
  (result.items || []).forEach((item) => {
    const li = document.createElement("li");
    const weight = item.weight != null ? `${item.weight}g · ` : "";
    li.textContent = `${item.name}: ${weight}${item.cal || 0} kcal`;
    estimateResultItems.appendChild(li);
  });
}

estimateBtn.addEventListener("click", async () => {
  const description = (estimateDescription.value || "").trim();
  showEstimateError("");
  renderEstimate(null);

  if (!description) {
    showEstimateError("Enter a meal description first.");
    return;
  }
  if (!CommitFitApi.enabled() || !CommitFitApi.currentUser()) {
    showEstimateError("Sign in to use AI meal estimate.");
    const authOpen = document.getElementById("auth-open-btn");
    if (authOpen) authOpen.click();
    return;
  }

  estimateBtn.disabled = true;
  const sendLabel = estimateBtn.querySelector(".estimate-send-label");
  if (sendLabel) sendLabel.textContent = "Estimating…";
  else estimateBtn.textContent = "Estimating…";
  try {
    const result = await CommitFitApi.api("/nutrition/estimate", {
      method: "POST",
      body: { description }
    });
    renderEstimate(result);
  } catch (err) {
    const msg = (err && err.message) || "Estimate failed";
    showEstimateError(msg);
  } finally {
    estimateBtn.disabled = false;
    if (sendLabel) sendLabel.textContent = "Estimate";
    else {
      estimateBtn.innerHTML = '<span class="estimate-send-label">Estimate</span><span class="estimate-send-icon" aria-hidden="true">↑</span>';
    }
  }
});

estimateArrowBtn.addEventListener("click", () => {
  if (!latestEstimate) return;
  const mealName = getReadyToLogName();
  if (!mealName) {
    showEstimateError("Enter a meal name before filling the form.");
    if (estimateResultName) estimateResultName.focus();
    return;
  }
  setMealCategory(latestEstimate.type);
  document.getElementById("meal-name").value = mealName;
  document.getElementById("meal-cal").value = String(latestEstimate.cal != null ? latestEstimate.cal : "");
  document.getElementById("meal-pro").value = String(round1(latestEstimate.pro));
  document.getElementById("meal-carbs").value = String(round1(latestEstimate.carb));
  document.getElementById("meal-fat").value = String(round1(latestEstimate.fat));
  closeEstimatePanel();
});

function syncGoalDisplays() {
  headerCalGoal.textContent = goals.calories;
  headerProGoal.textContent = goals.protein;
  inputCalGoal.value = goals.calories;
  inputProGoal.value = goals.protein;
  dayCalTarget.textContent = goals.calories;
  dayProTarget.textContent = goals.protein;
}

function clearLocalPrefix(prefix) {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.indexOf(prefix) === 0) keys.push(key);
  }
  keys.forEach((key) => localStorage.removeItem(key));
}

function loadMealsFromLocal() {
  mealsByDate = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || key.indexOf(STORAGE_PREFIX) !== 0) continue;
    const dateStr = key.slice(STORAGE_PREFIX.length);
    try {
      mealsByDate[dateStr] = JSON.parse(localStorage.getItem(key)) || [];
    } catch (err) {
      mealsByDate[dateStr] = [];
    }
  }
}

function persistMealsLocal(dateStr, meals) {
  mealsByDate[dateStr] = meals;
  if (!CommitFitApi.enabled()) return;
  if (!meals.length) localStorage.removeItem(`${STORAGE_PREFIX}${dateStr}`);
  else localStorage.setItem(`${STORAGE_PREFIX}${dateStr}`, JSON.stringify(meals));
}

function getMeals(dateStr) {
  if (mealsByDate[dateStr]) return mealsByDate[dateStr];
  if (!CommitFitApi.enabled()) return [];
  return JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}${dateStr}`)) || [];
}

async function refreshMealsFromApi() {
  const range = heatmapRange();
  const data = await CommitFitApi.api(`/nutrition?from=${range.from}&to=${range.to}`);
  mealsByDate = {};
  clearLocalPrefix(STORAGE_PREFIX);
  (data.items || []).forEach((meal) => {
    if (!mealsByDate[meal.date]) mealsByDate[meal.date] = [];
    mealsByDate[meal.date].push(meal);
  });
  Object.keys(mealsByDate).forEach((dateStr) => persistMealsLocal(dateStr, mealsByDate[dateStr]));
}

function renderYearHeatmap() {
  heatmapGrid.innerHTML = "";
  monthsRow.innerHTML = "";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const totalDays = 52 * 7;

  const startDate = new Date(today);
  startDate.setDate(today.getDate() - totalDays + 1);
  const startPad = startDate.getDay();

  for (let p = 0; p < startPad; p++) {
    const pad = document.createElement("div");
    pad.className = "day-cell is-pad";
    heatmapGrid.appendChild(pad);
  }

  let loggedCount = 0;
  let lastRenderedMonth = -1;
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  for (let i = 0; i < totalDays; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    const dateStr = localDateStr(d);

    const currentMonth = d.getMonth();
    const weekIndex = Math.floor((i + startPad) / 7);

    if (currentMonth !== lastRenderedMonth && d.getDay() === 1) {
      const monthSpan = document.createElement("span");
      monthSpan.className = "month-label-item";
      monthSpan.textContent = monthNames[currentMonth];
      monthSpan.style.left = `${weekIndex * 12.5}px`;
      monthsRow.appendChild(monthSpan);
      lastRenderedMonth = currentMonth;
    }

    const meals = getMeals(dateStr);
    const cal = meals.reduce((sum, m) => sum + m.calories, 0);
    const pro = meals.reduce((sum, m) => sum + m.protein, 0);

    if (meals.length > 0) loggedCount++;

    let lvl = "lvl-0";
    if (CommitFitDemo.active()) {
      const weekCol = Math.floor((i + startPad) / 7);
      const row = (i + startPad) % 7;
      const totalWeeks = Math.ceil((startPad + totalDays) / 7);
      lvl = CommitFitDemo.cellClass(weekCol, row, totalWeeks);
    } else {
      const percent = (cal / goals.calories) * 100;
      if (cal > 0) {
        if (percent > 105) lvl = "lvl-over";
        else if (percent >= 80) lvl = "lvl-3";
        else if (percent >= 50) lvl = "lvl-2";
        else lvl = "lvl-1";
      }
    }

    const cell = document.createElement("div");
    cell.className = `day-cell ${lvl}`;
    if (dateStr === selectedDate) cell.classList.add("active-selected");

    cell.addEventListener("mouseenter", (e) => {
      gridTooltip.style.display = "block";
      gridTooltip.innerHTML = `
        <strong>${dateStr}</strong><br>
        Calories: ${cal} / ${goals.calories} kcal<br>
        Protein: ${pro.toFixed(1)}g
      `;
      gridTooltip.style.left = `${e.pageX + 12}px`;
      gridTooltip.style.top = `${e.pageY - 38}px`;
    });

    cell.addEventListener("mouseleave", () => {
      gridTooltip.style.display = "none";
    });

    cell.addEventListener("click", () => {
      selectedDate = dateStr;
      document.querySelectorAll(".day-cell").forEach(c => c.classList.remove("active-selected"));
      cell.classList.add("active-selected");
      updateActiveDayView();
    });

    heatmapGrid.appendChild(cell);
  }

  totalDaysLogged.textContent = CommitFitDemo.active()
    ? "Sample progress"
    : `${loggedCount} days logged this year`;
  const wrapper = document.querySelector(".heatmap-wrapper");
  if (wrapper) wrapper.scrollLeft = wrapper.scrollWidth;
}

function updateActiveDayView() {
  const isToday = selectedDate === localDateStr();
  viewingDateLabel.textContent = isToday ? `Today (${selectedDate})` : selectedDate;

  const meals = getMeals(selectedDate);
  const totalCal = meals.reduce((sum, m) => sum + m.calories, 0);
  const totalPro = meals.reduce((sum, m) => sum + m.protein, 0);

  dayCalCount.textContent = totalCal;
  dayProCount.textContent = totalPro.toFixed(1);

  const calPct = Math.min((totalCal / goals.calories) * 100, 100);
  const proPct = Math.min((totalPro / goals.protein) * 100, 100);

  calProgressBar.style.width = `${calPct}%`;
  proProgressBar.style.width = `${proPct}%`;

  mealList.innerHTML = "";
  if (meals.length === 0) {
    mealList.innerHTML = `<li style="color: var(--text-muted); text-align: center; padding: 14px; font-size: 13px;">No meal entries logged for this date.</li>`;
  } else {
    meals.forEach((m) => {
      const li = document.createElement("li");
      li.className = "meal-row";
      const mealId = m.id || "";
      li.innerHTML = `
        <div>
          <span class="category-tag">${m.type}</span>
          <strong>${m.name}</strong>
          <span style="color: var(--text-muted); font-size: 12px; margin-left: 6px;">${m.calories} kcal | ${m.protein}g P | ${m.carbs != null ? m.carbs : 0}g C | ${m.fat != null ? m.fat : 0}g F</span>
        </div>
        <button class="delete-btn" data-id="${mealId}">Delete</button>
      `;
      li.querySelector(".delete-btn").addEventListener("click", () => removeMeal(mealId, m));
      mealList.appendChild(li);
    });
  }
}

function refreshView() {
  renderYearHeatmap();
  updateActiveDayView();
}

mealForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const type = hiddenMealInput.value;
  const name = document.getElementById("meal-name").value.trim();
  const calories = Number(document.getElementById("meal-cal").value);
  const protein = Number(document.getElementById("meal-pro").value);
  const carbsRaw = document.getElementById("meal-carbs").value;
  const fatRaw = document.getElementById("meal-fat").value;
  const carbs = carbsRaw === "" ? 0 : round1(carbsRaw);
  const fat = fatRaw === "" ? 0 : round1(fatRaw);

  if (!name || isNaN(calories) || isNaN(protein)) return;

  const meal = { type, name, calories, protein, carbs, fat };
  const currentMeals = getMeals(selectedDate).slice();

  try {
    if (CommitFitApi.enabled()) {
      const saved = await CommitFitApi.api(`/nutrition/${selectedDate}`, { method: "POST", body: meal });
      currentMeals.push(saved);
    } else {
      currentMeals.push(meal);
    }
    persistMealsLocal(selectedDate, currentMeals);
  } catch (err) {
    currentMeals.push(meal);
    persistMealsLocal(selectedDate, currentMeals);
  }

  document.getElementById("meal-name").value = "";
  document.getElementById("meal-cal").value = "";
  document.getElementById("meal-pro").value = "";
  document.getElementById("meal-carbs").value = "";
  document.getElementById("meal-fat").value = "";

  refreshView();
});

async function removeMeal(id, meal) {
  const currentMeals = getMeals(selectedDate).slice();
  const next = id
    ? currentMeals.filter((m) => m.id !== id)
    : currentMeals.filter((m) => m !== meal);
  persistMealsLocal(selectedDate, next);
  try {
    if (CommitFitApi.enabled() && id) {
      await CommitFitApi.api(`/nutrition/${selectedDate}/${encodeURIComponent(id)}`, { method: "DELETE" });
    }
  } catch (err) {
    persistMealsLocal(selectedDate, currentMeals);
  }
  refreshView();
}

resetDayBtn.addEventListener("click", async () => {
  if (!confirm(`Clear all meal records for ${selectedDate}?`)) return;
  const previous = getMeals(selectedDate).slice();
  persistMealsLocal(selectedDate, []);
  try {
    if (CommitFitApi.enabled()) {
      await CommitFitApi.api(`/nutrition/${selectedDate}`, { method: "DELETE" });
    }
  } catch (err) {
    persistMealsLocal(selectedDate, previous);
  }
  refreshView();
});

toggleGoalsBtn.addEventListener("click", () => {
  goalsDrawer.style.display = goalsDrawer.style.display === "none" ? "block" : "none";
});

saveGoalsBtn.addEventListener("click", async () => {
  goals.calories = Number(inputCalGoal.value) || 2000;
  goals.protein = Number(inputProGoal.value) || 120;
  if (CommitFitApi.enabled()) localStorage.setItem(STORAGE_GOALS, JSON.stringify(goals));
  try {
    if (CommitFitApi.enabled()) {
      await CommitFitApi.api("/profile", {
        method: "PUT",
        body: { calorieGoal: goals.calories, proteinGoal: goals.protein }
      });
    }
  } catch (err) {
    /* local copy already saved */
  }
  syncGoalDisplays();
  goalsDrawer.style.display = "none";
  refreshView();
});

async function boot() {
  if (CommitFitDemo.active()) {
    if (window.CommitFitApi && CommitFitApi.clearLocalAppData) CommitFitApi.clearLocalAppData();
    goals = Object.assign({}, DEFAULT_GOALS);
    mealsByDate = { [localDateStr()]: CommitFitDemo.meals() };
    syncGoalDisplays();
    refreshView();
    return;
  }
  const storedGoals = JSON.parse(localStorage.getItem(STORAGE_GOALS) || "null");
  if (storedGoals && storedGoals.calories != null) goals = storedGoals;
  loadMealsFromLocal();
  if (!CommitFitApi.enabled()) {
    syncGoalDisplays();
    refreshView();
    return;
  }
  let cloudProfile = null;
  try {
    cloudProfile = await CommitFitApi.api("/profile");
  } catch (err) {
    if (err && err.status === 404) {
      goals = Object.assign({}, DEFAULT_GOALS);
      localStorage.removeItem(STORAGE_GOALS);
    } else {
      loadMealsFromLocal();
    }
  }
  if (cloudProfile) {
    goals = {
      calories: cloudProfile.calorieGoal,
      protein: cloudProfile.proteinGoal
    };
    localStorage.setItem(STORAGE_GOALS, JSON.stringify(goals));
  }
  try {
    await CommitFitApi.migrateLocalDataIfNeeded({ uploadProfile: !cloudProfile });
    await refreshMealsFromApi();
    CommitFitApi.markLocalOwner();
  } catch (err) {
    loadMealsFromLocal();
  }
  syncGoalDisplays();
  refreshView();
  refreshPins();
}

syncGoalDisplays();
boot();
window.addEventListener("commitfit-auth", () => boot());
