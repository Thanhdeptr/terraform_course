const API_BASE = window.COMMITFIT_API_BASE || "";
const MIGRATED_KEY = "commitfit_migrated";

const CommitFitApi = (function () {
  function enabled() {
    return !!API_BASE;
  }

  async function api(path, options) {
    if (!API_BASE) throw new Error("API is not configured");
    const opts = options || {};
    const res = await fetch(`${API_BASE}${path}`, {
      method: opts.method || "GET",
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        ...(opts.headers || {})
      },
      body: opts.body != null ? (typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body)) : undefined
    });
    const text = await res.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (err) {
        data = { raw: text };
      }
    }
    if (!res.ok) {
      const error = new Error((data && data.error) || text || `HTTP ${res.status}`);
      error.status = res.status;
      throw error;
    }
    return data;
  }

  function localKeys(prefix) {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.indexOf(prefix) === 0) keys.push(key);
    }
    return keys;
  }

  async function migrateLocalDataIfNeeded(options) {
    if (!enabled()) return false;
    if (localStorage.getItem(MIGRATED_KEY) === "true") return false;

    const uploadProfile = options && options.uploadProfile;
    if (uploadProfile) {
      const nutritionGoals = JSON.parse(localStorage.getItem("nutrition_goals") || "null");
      const workoutSettings = JSON.parse(localStorage.getItem("workout_settings") || "null");
      const body = {};
      if (nutritionGoals && nutritionGoals.calories != null) body.calorieGoal = nutritionGoals.calories;
      if (nutritionGoals && nutritionGoals.protein != null) body.proteinGoal = nutritionGoals.protein;
      if (workoutSettings && workoutSettings.hardSetTarget != null) body.hardSetTarget = workoutSettings.hardSetTarget;
      if (workoutSettings && workoutSettings.plateIncrement != null) body.plateIncrement = workoutSettings.plateIncrement;
      if (Object.keys(body).length) {
        await api("/profile", { method: "PUT", body });
      }
    }

    const catalog = JSON.parse(localStorage.getItem("workout_catalog") || "null");
    if (Array.isArray(catalog) && catalog.length) {
      for (let i = 0; i < catalog.length; i++) {
        const ex = catalog[i];
        if (!ex || !ex.id) continue;
        await api(`/exercises/${encodeURIComponent(ex.id)}`, { method: "PUT", body: ex });
      }
    }

    const mealKeys = localKeys("nutrition_logs_");
    for (let i = 0; i < mealKeys.length; i++) {
      const key = mealKeys[i];
      const date = key.slice("nutrition_logs_".length);
      let meals = [];
      try {
        meals = JSON.parse(localStorage.getItem(key) || "[]") || [];
      } catch (err) {
        meals = [];
      }
      for (let j = 0; j < meals.length; j++) {
        const meal = meals[j] || {};
        const id = meal.id || `meal_${j}`;
        await api(`/nutrition/${encodeURIComponent(date)}/${encodeURIComponent(id)}`, {
          method: "PUT",
          body: {
            type: meal.type,
            name: meal.name,
            calories: meal.calories,
            protein: meal.protein
          }
        });
      }
    }

    const workoutKeys = localKeys("workout_logs_");
    for (let i = 0; i < workoutKeys.length; i++) {
      const key = workoutKeys[i];
      const date = key.slice("workout_logs_".length);
      let log = { flags: {}, sets: [] };
      try {
        log = JSON.parse(localStorage.getItem(key) || "null") || log;
      } catch (err) {
        log = { flags: {}, sets: [] };
      }
      const sets = (log.sets || []).map((set, index) =>
        Object.assign({}, set, { id: set.id || `set_${index}` })
      );
      await api(`/workouts/${encodeURIComponent(date)}`, {
        method: "PUT",
        body: {
          flags: log.flags || {},
          sets
        }
      });
    }

    localStorage.setItem(MIGRATED_KEY, "true");
    return true;
  }

  return {
    enabled,
    api,
    migrateLocalDataIfNeeded
  };
})();
