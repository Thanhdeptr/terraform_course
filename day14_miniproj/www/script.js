const STORAGE_PREFIX = "nutrition_logs_";
const STORAGE_GOALS = "nutrition_goals";

// 1. Initial targets
let goals = JSON.parse(localStorage.getItem(STORAGE_GOALS)) || {
  calories: 2000,
  protein: 120
};

// 2. Active date state
let selectedDate = new Date().toISOString().split("T")[0];

// DOM references
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

// Xử lý Custom Select cho Meal Category
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

// Đóng dropdown khi click ra ngoài
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
syncGoalDisplays();

function getMeals(dateStr) {
  return JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}${dateStr}`)) || [];
}

function saveMeals(dateStr, meals) {
  localStorage.setItem(`${STORAGE_PREFIX}${dateStr}`, JSON.stringify(meals));
}

// RENDER 52-WEEK HEATMAP & LABELS
function renderYearHeatmap() {
  heatmapGrid.innerHTML = "";
  monthsRow.innerHTML = "";

  const today = new Date();
  const totalDays = 52 * 7;
  
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - totalDays + 1);

  let loggedCount = 0;
  let lastRenderedMonth = -1;
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  for (let i = 0; i < totalDays; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    const dateStr = d.toISOString().split("T")[0];

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
}

// UPDATE RECORD DETAILS OF SELECTED DAY
function updateActiveDayView() {
  const isToday = selectedDate === new Date().toISOString().split("T")[0];
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
    meals.forEach((m, idx) => {
      const li = document.createElement("li");
      li.className = "meal-row";
      li.innerHTML = `
        <div>
          <span class="category-tag">${m.type}</span>
          <strong>${m.name}</strong>
          <span style="color: var(--text-muted); font-size: 12px; margin-left: 6px;">${m.calories} kcal | ${m.protein}g P</span>
        </div>
        <button class="delete-btn" onclick="removeMeal(${idx})">Delete</button>
      `;
      mealList.appendChild(li);
    });
  }
}

// Form Submit
mealForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const type = hiddenMealInput.value;
  const name = document.getElementById("meal-name").value.trim();
  const calories = Number(document.getElementById("meal-cal").value);
  const protein = Number(document.getElementById("meal-pro").value);

  if (!name || isNaN(calories) || isNaN(protein)) return;

  const currentMeals = getMeals(selectedDate);
  currentMeals.push({ type, name, calories, protein });
  saveMeals(selectedDate, currentMeals);

  document.getElementById("meal-name").value = "";
  document.getElementById("meal-cal").value = "";
  document.getElementById("meal-pro").value = "";

  renderYearHeatmap();
  updateActiveDayView();
});

window.removeMeal = function(index) {
  const currentMeals = getMeals(selectedDate);
  currentMeals.splice(index, 1);
  saveMeals(selectedDate, currentMeals);

  renderYearHeatmap();
  updateActiveDayView();
};

resetDayBtn.addEventListener("click", () => {
  if (confirm(`Clear all meal records for ${selectedDate}?`)) {
    localStorage.removeItem(`${STORAGE_PREFIX}${selectedDate}`);
    renderYearHeatmap();
    updateActiveDayView();
  }
});

toggleGoalsBtn.addEventListener("click", () => {
  goalsDrawer.style.display = goalsDrawer.style.display === "none" ? "block" : "none";
});

saveGoalsBtn.addEventListener("click", () => {
  goals.calories = Number(inputCalGoal.value) || 2000;
  goals.protein = Number(inputProGoal.value) || 120;
  localStorage.setItem(STORAGE_GOALS, JSON.stringify(goals));
  
  syncGoalDisplays();
  goalsDrawer.style.display = "none";
  renderYearHeatmap();
  updateActiveDayView();
});

renderYearHeatmap();
updateActiveDayView();