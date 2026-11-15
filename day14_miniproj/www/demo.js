const CommitFitDemo = (function () {
  const LETTERS = {
    P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
    R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
    O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
    G: ["01110", "10001", "10000", "10111", "10001", "10001", "01110"],
    E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
    S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"]
  };

  const SAMPLE_MEALS = [
    { id: "demo_breakfast", type: "Breakfast", name: "Greek yogurt, banana & honey", calories: 340, protein: 24, carbs: 42, fat: 8 },
    { id: "demo_lunch", type: "Lunch", name: "Chicken rice bowl", calories: 620, protein: 42, carbs: 68, fat: 14 },
    { id: "demo_snack", type: "Snack", name: "Protein shake", calories: 180, protein: 28, carbs: 8, fat: 3 },
    { id: "demo_dinner", type: "Dinner", name: "Salmon, potatoes & greens", calories: 560, protein: 38, carbs: 36, fat: 22 }
  ];

  const SAMPLE_WORKOUT = {
    flags: { deload: false, highStress: false, poorSleep: false },
    sets: [
      { id: "demo_s1", exerciseId: "bench_press", name: "Bench Press", role: "anchor", muscleGroup: "chest", weight: 80, reps: 5, rir: 1 },
      { id: "demo_s2", exerciseId: "bench_press", name: "Bench Press", role: "anchor", muscleGroup: "chest", weight: 80, reps: 5, rir: 1 },
      { id: "demo_s3", exerciseId: "bench_press", name: "Bench Press", role: "anchor", muscleGroup: "chest", weight: 77.5, reps: 6, rir: 2 },
      { id: "demo_s4", exerciseId: "ohp", name: "Overhead Press", role: "anchor", muscleGroup: "shoulders", weight: 45, reps: 6, rir: 2 },
      { id: "demo_s5", exerciseId: "ohp", name: "Overhead Press", role: "anchor", muscleGroup: "shoulders", weight: 45, reps: 6, rir: 2 },
      { id: "demo_s6", exerciseId: "chest_fly", name: "Chest Fly", role: "isolation", muscleGroup: "chest", weight: 12, reps: 12, rir: 2 },
      { id: "demo_s7", exerciseId: "lateral_raise", name: "Lateral Raise", role: "isolation", muscleGroup: "shoulders", weight: 8, reps: 15, rir: 1 }
    ]
  };

  function signedIn() {
    return !!(window.CommitFitApi && (CommitFitApi.enabled() || CommitFitApi.currentUser()));
  }

  function active() {
    return !signedIn();
  }

  function todayStr() {
    const date = new Date();
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function glyphRows() {
    const word = "PROGRESS";
    const rows = ["", "", "", "", "", "", ""];
    for (let i = 0; i < word.length; i++) {
      if (i) {
        for (let r = 0; r < 7; r++) rows[r] += "0";
      }
      const letter = LETTERS[word[i]];
      for (let r = 0; r < 7; r++) rows[r] += letter[r];
    }
    return rows;
  }

  const glyph = glyphRows();

  function cellClass(weekCol, row, totalWeeks) {
    const width = glyph[0].length;
    const startCol = Math.max(0, totalWeeks - width);
    const x = weekCol - startCol;
    if (row < 0 || row > 6 || x < 0 || x >= width) return "lvl-1";
    return glyph[row][x] === "1" ? "lvl-3" : "lvl-1";
  }

  function meals() {
    return clone(SAMPLE_MEALS);
  }

  function workout() {
    return clone(SAMPLE_WORKOUT);
  }

  return {
    active,
    todayStr,
    cellClass,
    meals,
    workout
  };
})();

window.CommitFitDemo = CommitFitDemo;
