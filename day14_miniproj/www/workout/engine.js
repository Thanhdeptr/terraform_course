const WorkoutEngine = (function () {
  const OVERLOAD_FACTOR = 1.015;
  const E1RM_REP_CAP = 12;
  const LOOKBACK_DAYS = 30;
  const DEFAULT_PLATE = 2.5;
  const DEFAULT_HARD_SET_TARGET = 6;

  const LEVELS = {
    0: { level: 0, percent: 0, className: "lvl-0", label: "Rest Day" },
    1: { level: 1, percent: 33, className: "lvl-1", label: "Active / Deload" },
    2: { level: 2, percent: 66, className: "lvl-2", label: "Volume Done" },
    3: { level: 3, percent: 100, className: "lvl-3", label: "Progressive Overload" },
    4: { level: 4, percent: 100, className: "lvl-pr", label: "All-Time PR" }
  };

  function localDateStr(d) {
    const date = d ? new Date(d) : new Date();
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function shiftDate(dateStr, days) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + days);
    return localDateStr(dt);
  }

  function rpeToRir(rpe) {
    return 10 - Number(rpe);
  }

  function effectiveReps(reps, rir) {
    return Number(reps) + Number(rir);
  }

  function e1rm(weight, reps, rir) {
    return Number(weight) * (1 + effectiveReps(reps, rir) / 30);
  }

  function isNoisy(flags) {
    return !!(flags && (flags.deload || flags.highStress || flags.poorSleep));
  }

  function isRecordableSet(set) {
    return !!(
      set &&
      !set.isWarmup &&
      set.role === "anchor" &&
      Number(set.reps) <= E1RM_REP_CAP
    );
  }

  function isHardSet(set) {
    return !!(set && !set.isWarmup && Number(set.rir) <= 3);
  }

  function isWorkingSet(set) {
    return !!(set && !set.isWarmup);
  }

  function setE1rm(set) {
    if (!isRecordableSet(set)) return null;
    return e1rm(set.weight, set.reps, set.rir);
  }

  function roundToPlate(kg, increment) {
    const step = increment || DEFAULT_PLATE;
    return Math.round(Number(kg) / step) * step;
  }

  function maxE1rmForExercise(sets, exerciseId) {
    let max = 0;
    (sets || []).forEach((set) => {
      if (set.exerciseId !== exerciseId) return;
      const val = setE1rm(set);
      if (val != null && val > max) max = val;
    });
    return max;
  }

  function priorMaxE1rm(exerciseId, asOfDate, logsByDate, windowStart) {
    let max = 0;
    Object.keys(logsByDate || {}).forEach((dateStr) => {
      if (dateStr >= asOfDate) return;
      if (windowStart && dateStr < windowStart) return;
      const log = logsByDate[dateStr];
      if (isNoisy(log && log.flags)) return;
      const val = maxE1rmForExercise(log && log.sets, exerciseId);
      if (val > max) max = val;
    });
    return max;
  }

  function baselineE1rm(exerciseId, asOfDate, logsByDate) {
    const windowStart = shiftDate(asOfDate, -LOOKBACK_DAYS);
    const inWindow = priorMaxE1rm(exerciseId, asOfDate, logsByDate, windowStart);
    if (inWindow > 0) return inWindow;
    return priorMaxE1rm(exerciseId, asOfDate, logsByDate, null);
  }

  function allTimePriorE1rm(exerciseId, asOfDate, logsByDate) {
    return priorMaxE1rm(exerciseId, asOfDate, logsByDate, null);
  }

  function todayBestE1rm(exerciseId, log) {
    return maxE1rmForExercise(log && log.sets, exerciseId);
  }

  function countHardSets(log) {
    return ((log && log.sets) || []).filter(isHardSet).length;
  }

  function hasWorkingSet(log) {
    return ((log && log.sets) || []).some(isWorkingSet);
  }

  function uniqueAnchorIds(log) {
    const ids = [];
    ((log && log.sets) || []).forEach((set) => {
      if (set.role !== "anchor" || set.isWarmup) return;
      if (ids.indexOf(set.exerciseId) === -1) ids.push(set.exerciseId);
    });
    return ids;
  }

  function scoreDay(dateStr, log, logsByDate, hardSetTarget) {
    const target = hardSetTarget || DEFAULT_HARD_SET_TARGET;
    if (!hasWorkingSet(log)) return Object.assign({}, LEVELS[0]);

    if (log.flags && log.flags.deload) return Object.assign({}, LEVELS[1]);

    const hardSets = countHardSets(log);
    const hasVolume = hardSets >= target;
    let hasOverload = false;
    let hasPR = false;

    uniqueAnchorIds(log).forEach((exerciseId) => {
      const best = todayBestE1rm(exerciseId, log);
      if (best <= 0) return;
      const baseline = baselineE1rm(exerciseId, dateStr, logsByDate);
      if (baseline <= 0) return;
      if (best >= baseline * OVERLOAD_FACTOR) hasOverload = true;
      const allTime = allTimePriorE1rm(exerciseId, dateStr, logsByDate);
      if (allTime > 0 && best > allTime) hasPR = true;
    });

    if (hasPR) return Object.assign({}, LEVELS[4]);
    if (hasOverload) return Object.assign({}, LEVELS[3]);
    if (hasVolume) return Object.assign({}, LEVELS[2]);
    return Object.assign({}, LEVELS[1]);
  }

  function scoreWithHypothetical(dateStr, log, logsByDate, hardSetTarget, extraSet) {
    const clone = {
      flags: Object.assign({}, (log && log.flags) || {}),
      sets: ((log && log.sets) || []).concat([extraSet])
    };
    const nextLogs = Object.assign({}, logsByDate);
    nextLogs[dateStr] = clone;
    return scoreDay(dateStr, clone, nextLogs, hardSetTarget);
  }

  function suggest(weight, reps, targetRIR, baseline, plateIncrement) {
    if (!baseline || baseline <= 0) {
      return { initializing: true };
    }

    const w = Number(weight);
    const r = Number(reps);
    const rir = Number(targetRIR) || 0;
    const step = plateIncrement || DEFAULT_PLATE;
    const targetE1RM = baseline * OVERLOAD_FACTOR;

    if (!w || w <= 0) {
      return { initializing: false, targetE1RM, targetReps: null, targetWeight: null };
    }

    const rawTargetReps = (targetE1RM / w - 1) * 30 - rir;
    const targetReps = Math.max(1, Math.ceil(rawTargetReps));

    let targetWeight = null;
    if (r > 0) {
      targetWeight = roundToPlate(targetE1RM / (1 + (r + rir) / 30), step);
      if (e1rm(targetWeight, r, rir) < targetE1RM) {
        targetWeight = roundToPlate(targetWeight + step, step);
      }
    }

    return { initializing: false, targetE1RM, targetReps, targetWeight };
  }

  return {
    OVERLOAD_FACTOR,
    E1RM_REP_CAP,
    LOOKBACK_DAYS,
    DEFAULT_PLATE,
    DEFAULT_HARD_SET_TARGET,
    LEVELS,
    localDateStr,
    shiftDate,
    rpeToRir,
    effectiveReps,
    e1rm,
    isNoisy,
    isRecordableSet,
    isHardSet,
    isWorkingSet,
    setE1rm,
    roundToPlate,
    baselineE1rm,
    allTimePriorE1rm,
    todayBestE1rm,
    countHardSets,
    hasWorkingSet,
    scoreDay,
    scoreWithHypothetical,
    suggest
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = WorkoutEngine;
}
