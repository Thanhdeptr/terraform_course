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

let goals = JSON.parse(localStorage.getItem(STORAGE_GOALS)) || {
  calories: 2000,
  protein: 120
};

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

selectTrigger.addEventListener("click", (e) => {
  e.stopPropagation();
  customSelect.classList.toggle("open");
});

customOptions.forEach(option => {
  option.addEventListener("click", (e) => {
    e.stopPropagation();
    customOptions.forEach(opt => opt.classList.remove("selected"));
    option.classList.add("selected");

    const val = option.dataset.value;
    hiddenMealInput.value = val;
    selectedMealLabel.textContent = val;
    customSelect.classList.remove("open");
  });
});

document.addEventListener("click", () => {
  customSelect.classList.remove("open");
});

function syncGoalDisplays() {
  headerCalGoal.textContent = goals.calories;
  headerProGoal.textContent = goals.protein;
  inputCalGoal.value = goals.calories;
  inputProGoal.value = goals.protein;
  dayCalTarget.textContent = goals.calories;
  dayProTarget.textContent = goals.protein;
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
  if (!meals.length) localStorage.removeItem(`${STORAGE_PREFIX}${dateStr}`);
  else localStorage.setItem(`${STORAGE_PREFIX}${dateStr}`, JSON.stringify(meals));
}

function getMeals(dateStr) {
  if (mealsByDate[dateStr]) return mealsByDate[dateStr];
  return JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}${dateStr}`)) || [];
}

async function refreshMealsFromApi() {
  const range = heatmapRange();
  const data = await CommitFitApi.api(`/nutrition?from=${range.from}&to=${range.to}`);
  mealsByDate = {};
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
    const percent = (cal / goals.calories) * 100;
    if (cal > 0) {
      if (percent > 105) lvl = "lvl-over";
      else if (percent >= 80) lvl = "lvl-3";
      else if (percent >= 50) lvl = "lvl-2";
      else lvl = "lvl-1";
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

  totalDaysLogged.textContent = `${loggedCount} days logged this year`;
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
          <span style="color: var(--text-muted); font-size: 12px; margin-left: 6px;">${m.calories} kcal | ${m.protein}g P</span>
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

  if (!name || isNaN(calories) || isNaN(protein)) return;

  const meal = { type, name, calories, protein };
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
  localStorage.setItem(STORAGE_GOALS, JSON.stringify(goals));
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
    if (!err || err.status !== 404) loadMealsFromLocal();
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
  } catch (err) {
    loadMealsFromLocal();
  }
  syncGoalDisplays();
  refreshView();
}

syncGoalDisplays();
boot();
