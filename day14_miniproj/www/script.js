const STORAGE_PREFIX = "nutrition_logs_";
const STORAGE_GOALS = "nutrition_goals";

// 1. Đọc mục tiêu cá nhân
let goals = JSON.parse(localStorage.getItem(STORAGE_GOALS)) || {
  calories: 2000,
  protein: 120
};

// 2. Mặc định ngày xem là Hôm Nay (theo giờ máy local YYYY-MM-DD)
let selectedDate = new Date().toISOString().split("T")[0];

// DOM References
const headerCalGoal = document.getElementById("header-cal-goal");
const headerProGoal = document.getElementById("header-pro-goal");
const inputCalGoal = document.getElementById("input-cal-goal");
const inputProGoal = document.getElementById("input-pro-goal");
const toggleConfigBtn = document.getElementById("toggle-config-btn");
const configDrawer = document.getElementById("config-drawer");
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

// Khởi tạo hiển thị ban đầu
function syncGoalDisplays() {
  headerCalGoal.textContent = goals.calories;
  headerProGoal.textContent = goals.protein;
  inputCalGoal.value = goals.calories;
  inputProGoal.value = goals.protein;
  dayCalTarget.textContent = goals.calories;
  dayProTarget.textContent = goals.protein;
}
syncGoalDisplays();

// Đọc và Ghi LocalStorage
function getMeals(dateStr) {
  return JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}${dateStr}`)) || [];
}

function saveMeals(dateStr, meals) {
  localStorage.setItem(`${STORAGE_PREFIX}${dateStr}`, JSON.stringify(meals));
}

// TÍNH TOÁN VÀ VẼ LƯỚI 52 TUẦN + TỰ ĐỘNG CĂN THÁNG KHÔNG THANH CUỘN
function renderYearHeatmap() {
  heatmapGrid.innerHTML = "";
  monthsRow.innerHTML = "";

  const today = new Date();
  const totalDays = 52 * 7; // 364 ngày (52 tuần đầy đủ)
  
  // Lùi về đúng 52 tuần trước
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - totalDays + 1);

  let loggedCount = 0;
  let lastRenderedMonth = -1;

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  for (let i = 0; i < totalDays; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    const dateStr = d.toISOString().split("T")[0];

    // Xác định nhãn tháng khi chuyển sang tháng mới tại dòng đầu tiên (chủ nhật/thứ hai)
    const currentMonth = d.getMonth();
    const weekIndex = Math.floor(i / 7);

    if (currentMonth !== lastRenderedMonth && d.getDay() === 1) {
      const monthSpan = document.createElement("span");
      monthSpan.className = "month-label-item";
      monthSpan.textContent = monthNames[currentMonth];
      // Căn khoảng cách chính xác theo tuần (10px ô + 2.5px khoảng cách)
      monthSpan.style.left = `${weekIndex * 12.5}px`;
      monthsRow.appendChild(monthSpan);
      lastRenderedMonth = currentMonth;
    }

    const meals = getMeals(dateStr);
    const cal = meals.reduce((sum, m) => sum + m.calories, 0);
    const pro = meals.reduce((sum, m) => sum + m.protein, 0);

    if (meals.length > 0) loggedCount++;

    // Xác định độ đậm của màu xanh
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

    // Tooltip
    cell.addEventListener("mouseenter", (e) => {
      gridTooltip.style.display = "block";
      gridTooltip.innerHTML = `
        <strong>${dateStr}</strong><br>
        • Calories: ${cal} / ${goals.calories} kcal<br>
        • Protein: ${pro.toFixed(1)}g
      `;
      gridTooltip.style.left = `${e.pageX + 12}px`;
      gridTooltip.style.top = `${e.pageY - 38}px`;
    });

    cell.addEventListener("mouseleave", () => {
      gridTooltip.style.display = "none";
    });

    // Bấm vào ô chọn ngày
    cell.addEventListener("click", () => {
      selectedDate = dateStr;
      document.querySelectorAll(".day-cell").forEach(c => c.classList.remove("active-selected"));
      cell.classList.add("active-selected");
      updateActiveDayView();
    });

    heatmapGrid.appendChild(cell);
  }

  totalDaysLogged.textContent = `${loggedCount} days logged in the last year`;
}

// CẬP NHẬT CHI TIẾT NGÀY ĐANG ĐƯỢC CHỌN
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

  // Danh sách các bữa ăn
  mealList.innerHTML = "";
  if (meals.length === 0) {
    mealList.innerHTML = `<li style="color: var(--text-muted); text-align: center; padding: 16px; font-size: 13px;">No meals logged for this day yet.</li>`;
  } else {
    meals.forEach((m, idx) => {
      const li = document.createElement("li");
      li.className = "meal-row";
      li.innerHTML = `
        <div>
          <span class="meal-tag tag-${m.type}">${m.type}</span>
          <strong>${m.name}</strong>
          <span style="color: var(--text-muted); font-size: 12px; margin-left: 6px;">${m.calories} kcal | ${m.protein}g P</span>
        </div>
        <button class="del-btn" onclick="removeMeal(${idx})">Delete</button>
      `;
      mealList.appendChild(li);
    });
  }
}

// Thêm bữa ăn
mealForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const type = document.getElementById("meal-type").value;
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

// Xóa 1 món
window.removeMeal = function(index) {
  const currentMeals = getMeals(selectedDate);
  currentMeals.splice(index, 1);
  saveMeals(selectedDate, currentMeals);

  renderYearHeatmap();
  updateActiveDayView();
};

// Clear cả ngày
resetDayBtn.addEventListener("click", () => {
  if (confirm(`Bạn có chắc muốn xóa sạch toàn bộ bữa ăn của ngày ${selectedDate}?`)) {
    localStorage.removeItem(`${STORAGE_PREFIX}${selectedDate}`);
    renderYearHeatmap();
    updateActiveDayView();
  }
});

// Toggle cấu hình mục tiêu
toggleConfigBtn.addEventListener("click", () => {
  configDrawer.style.display = configDrawer.style.display === "none" ? "block" : "none";
});

saveGoalsBtn.addEventListener("click", () => {
  goals.calories = Number(inputCalGoal.value) || 2000;
  goals.protein = Number(inputProGoal.value) || 120;
  localStorage.setItem(STORAGE_GOALS, JSON.stringify(goals));
  
  syncGoalDisplays();
  configDrawer.style.display = "none";
  renderYearHeatmap();
  updateActiveDayView();
});

// Khởi chạy khi load trang
renderYearHeatmap();
updateActiveDayView();