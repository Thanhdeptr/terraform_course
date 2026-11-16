import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  DeleteCommand,
  QueryCommand
} from "@aws-sdk/lib-dynamodb";
import { GoogleGenAI } from "@google/genai";
import { randomUUID } from "node:crypto";
import { leanMealSchema } from "./leanMealSchema.js";

const TABLE_NAME = process.env.TABLE_NAME;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash-lite";
const GEMINI_TIMEOUT_MS = 20000;
const DESCRIPTION_MAX = 800;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const COMPACT_SYSTEM_INSTRUCTION = `
Nutrition expert: break down meals and estimate macros using USDA-style references:
1. type: breakfast | lunch | dinner | snack (default lunch if unclear).
2. name: concise name for the whole meal.
3. Cooking / seasoning calorie rules:
   - Boiled / steamed / raw: keep base macros.
   - Light pan-sear, little oil: +4g fat.
   - Regular fry: +8g to 10g fat per 150g meat.
   - Battered / breaded fry: +12g fat, +12g carb.
   - Heavy seasoning / sweet sauce / oyster sauce: +5g carb, +3g fat.
   - Light seasoning / salt and pepper only: no add-on.
4. Meal cal/pro/carb/fat must equal the sum of items. Round to 1 decimal place.
`;

const DEFAULT_PROFILE = {
  calorieGoal: 2000,
  proteinGoal: 120,
  hardSetTarget: 6,
  plateIncrement: 2.5
};

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

const EMPTY_FLAGS = { deload: false, highStress: false, poorSleep: false };

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true }
});

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store"
    },
    body: JSON.stringify(body)
  };
}

function getUserId(event) {
  const auth = event.requestContext && event.requestContext.authorizer;
  const sub =
    (auth && auth.jwt && auth.jwt.claims && auth.jwt.claims.sub) ||
    (auth && auth.claims && auth.claims.sub);
  if (sub) return String(sub);
  return "dev";
}

function pkOf(event) {
  return `USER#${getUserId(event)}`;
}

function parseBody(event) {
  if (!event.body) return {};
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;
  try {
    return JSON.parse(raw);
  } catch (err) {
    const error = new Error("Invalid JSON body");
    error.statusCode = 400;
    throw error;
  }
}

function requireDate(value, label) {
  if (!value || !DATE_RE.test(value)) {
    const error = new Error(`${label || "date"} must be yyyy-mm-dd`);
    error.statusCode = 400;
    throw error;
  }
  return value;
}

function nextDay(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

function newId() {
  return randomUUID();
}

function round1(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 10) / 10;
}

function asInt(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v);
}

function asNonNeg(n, rounded = true) {
  const v = rounded ? round1(n) : asInt(n);
  return v < 0 ? 0 : v;
}

async function queryAll(params) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const res = await ddb.send(
      new QueryCommand(Object.assign({}, params, { ExclusiveStartKey }))
    );
    if (res.Items) items.push.apply(items, res.Items);
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

async function queryPrefix(pk, prefix) {
  return queryAll({
    TableName: TABLE_NAME,
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
    ConsistentRead: true,
    ExpressionAttributeValues: { ":pk": pk, ":sk": prefix }
  });
}

async function queryRange(pk, startSk, endSk) {
  return queryAll({
    TableName: TABLE_NAME,
    KeyConditionExpression: "PK = :pk AND SK BETWEEN :start AND :end",
    ConsistentRead: true,
    ExpressionAttributeValues: {
      ":pk": pk,
      ":start": startSk,
      ":end": endSk
    }
  });
}

function publicExercise(item) {
  return {
    id: item.id,
    name: item.name,
    role: item.role,
    muscleGroup: item.muscleGroup
  };
}

function publicMeal(item) {
  const sk = String(item.SK || "");
  const fromSk = sk.indexOf("N#") === 0 ? sk.slice(2, 12) : "";
  return {
    id: item.id,
    date: item.date || fromSk,
    type: item.type,
    name: item.name,
    calories: item.calories,
    protein: item.protein,
    carbs: item.carbs != null ? Number(item.carbs) : 0,
    fat: item.fat != null ? Number(item.fat) : 0
  };
}

const MEAL_TYPE_MAP = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack"
};

function publicPin(item) {
  return {
    id: item.id,
    type: item.type || "Snack",
    name: item.name,
    calories: Number(item.calories) || 0,
    protein: Number(item.protein) || 0,
    carbs: item.carbs != null ? Number(item.carbs) : 0,
    fat: item.fat != null ? Number(item.fat) : 0,
    items: Array.isArray(item.items) ? item.items : [],
    createdAt: item.createdAt || null
  };
}

function normalizePin(body, id) {
  const name = String(body.name || "").trim();
  const calories = Number(body.calories != null ? body.calories : body.cal);
  const protein = Number(body.protein != null ? body.protein : body.pro);
  if (!name || Number.isNaN(calories) || Number.isNaN(protein)) {
    const error = new Error("name, calories, and protein are required");
    error.statusCode = 400;
    throw error;
  }
  const carbsRaw = body.carbs != null ? body.carbs : body.carb;
  const fatRaw = body.fat;
  const typeRaw = String(body.type || "Snack");
  const typeMapped = MEAL_TYPE_MAP[typeRaw.toLowerCase()] || typeRaw;
  return {
    id,
    type: typeMapped,
    name,
    calories,
    protein,
    carbs: carbsRaw == null || Number.isNaN(Number(carbsRaw)) ? 0 : asNonNeg(carbsRaw),
    fat: fatRaw == null || Number.isNaN(Number(fatRaw)) ? 0 : asNonNeg(fatRaw),
    items: Array.isArray(body.items) ? body.items : [],
    createdAt: body.createdAt || new Date().toISOString()
  };
}

async function putPin(pk, pin) {
  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: pk,
        SK: `PIN#${pin.id}`,
        id: pin.id,
        type: pin.type,
        name: pin.name,
        calories: pin.calories,
        protein: pin.protein,
        carbs: pin.carbs,
        fat: pin.fat,
        items: pin.items,
        createdAt: pin.createdAt
      }
    })
  );
  return publicPin(pin);
}

async function listPins(pk) {
  const items = await queryPrefix(pk, "PIN#");
  return items
    .map(publicPin)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

function publicWorkout(item) {
  return {
    date: item.date,
    flags: Object.assign({}, EMPTY_FLAGS, item.flags || {}),
    sets: item.sets || []
  };
}

function publicProfile(item) {
  return {
    calorieGoal: item.calorieGoal,
    proteinGoal: item.proteinGoal,
    hardSetTarget: item.hardSetTarget,
    plateIncrement: item.plateIncrement
  };
}

async function getProfile(pk) {
  const res = await ddb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: pk, SK: "PROFILE" },
      ConsistentRead: true
    })
  );
  return res.Item || null;
}

async function putProfile(pk, body) {
  const current = (await getProfile(pk)) || {};
  const item = {
    PK: pk,
    SK: "PROFILE",
    calorieGoal: Number(body.calorieGoal != null ? body.calorieGoal : current.calorieGoal != null ? current.calorieGoal : DEFAULT_PROFILE.calorieGoal),
    proteinGoal: Number(body.proteinGoal != null ? body.proteinGoal : current.proteinGoal != null ? current.proteinGoal : DEFAULT_PROFILE.proteinGoal),
    hardSetTarget: Number(body.hardSetTarget != null ? body.hardSetTarget : current.hardSetTarget != null ? current.hardSetTarget : DEFAULT_PROFILE.hardSetTarget),
    plateIncrement: Number(body.plateIncrement != null ? body.plateIncrement : current.plateIncrement != null ? current.plateIncrement : DEFAULT_PROFILE.plateIncrement)
  };
  await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
  return publicProfile(item);
}

async function listExercises(pk) {
  const items = await queryPrefix(pk, "EX#");
  return items.map(publicExercise);
}

async function materializeDefaultsIfEmpty(pk) {
  const existing = await listExercises(pk);
  if (existing.length) return existing;
  await Promise.all(
    DEFAULT_CATALOG.map((ex) =>
      ddb.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            PK: pk,
            SK: `EX#${ex.id}`,
            id: ex.id,
            name: ex.name,
            role: ex.role,
            muscleGroup: ex.muscleGroup
          }
        })
      )
    )
  );
  return DEFAULT_CATALOG.map((ex) => Object.assign({}, ex));
}

function normalizeExercise(body, id) {
  const name = String(body.name || "").trim();
  if (!name) {
    const error = new Error("name is required");
    error.statusCode = 400;
    throw error;
  }
  return {
    id,
    name,
    role: body.role === "isolation" ? "isolation" : "anchor",
    muscleGroup: String(body.muscleGroup || "chest")
  };
}

async function putExercise(pk, exercise) {
  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: pk,
        SK: `EX#${exercise.id}`,
        id: exercise.id,
        name: exercise.name,
        role: exercise.role,
        muscleGroup: exercise.muscleGroup
      }
    })
  );
  return exercise;
}

function normalizeMeal(body, date, id) {
  const name = String(body.name || "").trim();
  const calories = Number(body.calories);
  const protein = Number(body.protein);
  if (!name || Number.isNaN(calories) || Number.isNaN(protein)) {
    const error = new Error("name, calories, and protein are required");
    error.statusCode = 400;
    throw error;
  }
  const carbsRaw = body.carbs != null ? Number(body.carbs) : 0;
  const fatRaw = body.fat != null ? Number(body.fat) : 0;
  return {
    id,
    date,
    type: String(body.type || "Snack"),
    name,
    calories,
    protein,
    carbs: Number.isNaN(carbsRaw) ? 0 : asNonNeg(carbsRaw),
    fat: Number.isNaN(fatRaw) ? 0 : asNonNeg(fatRaw)
  };
}

async function putMeal(pk, meal) {
  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: pk,
        SK: `N#${meal.date}#${meal.id}`,
        id: meal.id,
        date: meal.date,
        type: meal.type,
        name: meal.name,
        calories: meal.calories,
        protein: meal.protein,
        carbs: meal.carbs,
        fat: meal.fat
      }
    })
  );
  return publicMeal(meal);
}

function normalizeWorkout(body, date) {
  const flags = Object.assign({}, EMPTY_FLAGS, body.flags || {});
  const sets = Array.isArray(body.sets) ? body.sets : [];
  return {
    date,
    flags: {
      deload: !!flags.deload,
      highStress: !!flags.highStress,
      poorSleep: !!flags.poorSleep
    },
    sets: sets.map((set, index) => ({
      id: set.id || `set_${index}`,
      exerciseId: set.exerciseId,
      name: set.name,
      role: set.role,
      muscleGroup: set.muscleGroup,
      weight: Number(set.weight),
      reps: Number(set.reps),
      rir: Number(set.rir),
      isWarmup: !!set.isWarmup
    }))
  };
}

async function putWorkout(pk, workout) {
  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: pk,
        SK: `W#${workout.date}`,
        date: workout.date,
        flags: workout.flags,
        sets: workout.sets
      }
    })
  );
  return publicWorkout(workout);
}

function normalizeLeanMeal(raw) {
  const data = raw && typeof raw === "object" ? raw : {};
  const items = Array.isArray(data.items)
    ? data.items.map((item) => ({
        name: String((item && item.name) || "").trim() || "item",
        weight: item && item.weight != null ? asNonNeg(item.weight, false) : undefined,
        cal: asNonNeg(item && item.cal, false),
        pro: asNonNeg(item && item.pro),
        carb: asNonNeg(item && item.carb),
        fat: asNonNeg(item && item.fat)
      }))
    : [];

  const type = String(data.type || "lunch").toLowerCase();
  return {
    type: ["breakfast", "lunch", "dinner", "snack"].includes(type) ? type : "lunch",
    name: String(data.name || "").trim() || "Meal",
    cal: asNonNeg(data.cal, false),
    pro: asNonNeg(data.pro),
    carb: asNonNeg(data.carb),
    fat: asNonNeg(data.fat),
    items
  };
}

function parseGeminiJson(response) {
  const text =
    (response && typeof response.text === "string" && response.text) ||
    (response &&
      response.candidates &&
      response.candidates[0] &&
      response.candidates[0].content &&
      response.candidates[0].content.parts &&
      response.candidates[0].content.parts.map((p) => p.text || "").join("")) ||
    "";
  if (!text) {
    const error = new Error("Empty model response");
    error.statusCode = 502;
    error.retryable = true;
    throw error;
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    const error = new Error("Invalid model JSON");
    error.statusCode = 502;
    error.retryable = true;
    throw error;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapGeminiEstimateError(err) {
  const msg = String((err && err.message) || err || "Gemini request failed");
  const status =
    (err && (err.status || err.statusCode || err.code)) != null
      ? String(err.status || err.statusCode || err.code)
      : "";
  const timedOut = /timeout|aborted|AbortError/i.test(msg);
  const badKey = /api key|invalid.*key|permission|unauthenticated|401|403/i.test(msg);
  const badModel =
    (/not found|404/i.test(msg) || status === "404") &&
    /model/i.test(msg + " " + status);
  // Transient capacity / upstream issues — should retry
  const unavailable =
    status === "503" ||
    /503|service\s*unavailable|unavailable|overloaded|resource.?exhausted|high demand|try again/i.test(
      msg
    );

  let publicMsg = "Meal estimate failed";
  let statusCode = 502;
  let retryable = true;

  if (timedOut) {
    publicMsg = "Meal estimate timed out";
    statusCode = 504;
    retryable = true;
  } else if (badKey) {
    publicMsg = "Meal estimate failed: invalid or unauthorized Gemini API key";
    statusCode = 502;
    retryable = false;
  } else if (badModel) {
    publicMsg = `Meal estimate failed: model unavailable (${GEMINI_MODEL})`;
    statusCode = 502;
    retryable = false;
  } else if (unavailable) {
    publicMsg = "Meal estimate temporarily unavailable";
    statusCode = 503;
    retryable = true;
  }

  const error = new Error(publicMsg);
  error.statusCode = statusCode;
  error.retryable = retryable;
  error.causeMessage = msg;
  return error;
}

async function estimateMealMacros(description) {
  if (!GEMINI_API_KEY) {
    const error = new Error("Meal estimate is not configured");
    error.statusCode = 503;
    throw error;
  }

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const maxAttempts = 3; // 1 initial + 2 retries
  const retryDelayMs = 1500;
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: description,
        config: {
          systemInstruction: COMPACT_SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          responseSchema: leanMealSchema,
          httpOptions: { timeout: GEMINI_TIMEOUT_MS }
        }
      });
      return normalizeLeanMeal(parseGeminiJson(response));
    } catch (err) {
      const mapped =
        err && typeof err.retryable === "boolean"
          ? err
          : mapGeminiEstimateError(err);

      console.error(
        `Gemini estimate error (attempt ${attempt}/${maxAttempts}):`,
        mapped.causeMessage || mapped.message
      );
      lastError = mapped;

      const canRetry = mapped.retryable !== false && attempt < maxAttempts;
      if (!canRetry) {
        const out = new Error(mapped.message || "Meal estimate failed");
        out.statusCode = mapped.statusCode || 502;
        throw out;
      }
      await sleep(retryDelayMs);
    }
  }

  const out = new Error((lastError && lastError.message) || "Meal estimate failed");
  out.statusCode = (lastError && lastError.statusCode) || 502;
  throw out;
}

function routeParts(event) {
  const method = (event.requestContext && event.requestContext.http && event.requestContext.http.method) || "GET";
  const rawPath = event.rawPath || "/";
  const path = rawPath.replace(/\/+$/, "") || "/";
  const parts = path.split("/").filter(Boolean);
  const qs = event.queryStringParameters || {};
  const pathParams = event.pathParameters || {};
  return { method, path, parts, qs, pathParams };
}

async function dispatch(event) {
  const pk = pkOf(event);
  const { method, parts, qs, pathParams } = routeParts(event);
  const dateParam = pathParams.date || parts[1];
  const idParam = pathParams.id || parts[2];

  if (parts[0] === "profile" && parts.length === 1) {
    if (method === "GET") {
      const item = await getProfile(pk);
      if (!item) return json(404, { error: "Profile not found" });
      return json(200, publicProfile(item));
    }
    if (method === "PUT") {
      return json(200, await putProfile(pk, parseBody(event)));
    }
  }

  if (parts[0] === "exercises" && parts.length === 1) {
    if (method === "GET") {
      const items = await listExercises(pk);
      return json(200, { items: items.length ? items : DEFAULT_CATALOG.map((ex) => Object.assign({}, ex)) });
    }
    if (method === "POST") {
      await materializeDefaultsIfEmpty(pk);
      const exercise = normalizeExercise(parseBody(event), `custom_${Date.now()}`);
      return json(201, await putExercise(pk, exercise));
    }
  }

  if (parts[0] === "exercises" && parts.length === 2) {
    const id = decodeURIComponent(idParam || parts[1]);
    if (method === "PUT") {
      await materializeDefaultsIfEmpty(pk);
      const exercise = normalizeExercise(parseBody(event), id);
      return json(200, await putExercise(pk, exercise));
    }
    if (method === "DELETE") {
      await materializeDefaultsIfEmpty(pk);
      await ddb.send(
        new DeleteCommand({
          TableName: TABLE_NAME,
          Key: { PK: pk, SK: `EX#${id}` }
        })
      );
      return json(200, { ok: true });
    }
  }

  if (parts[0] === "pins" && parts.length === 1) {
    if (method === "GET") {
      return json(200, { items: await listPins(pk) });
    }
    if (method === "POST") {
      const pin = normalizePin(parseBody(event), `pin_${newId()}`);
      return json(201, await putPin(pk, pin));
    }
  }

  if (parts[0] === "pins" && parts.length === 2 && method === "DELETE") {
    const id = decodeURIComponent(idParam || parts[1]);
    await ddb.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { PK: pk, SK: `PIN#${id}` }
      })
    );
    return json(200, { ok: true });
  }

  if (parts[0] === "nutrition" && parts.length === 2 && parts[1] === "estimate" && method === "POST") {
    const body = parseBody(event);
    const description = String(body.description || "").trim().slice(0, DESCRIPTION_MAX);
    if (!description) {
      const error = new Error("description is required");
      error.statusCode = 400;
      throw error;
    }
    return json(200, await estimateMealMacros(description));
  }

  if (parts[0] === "nutrition" && parts.length === 1 && method === "GET") {
    const from = requireDate(qs.from, "from");
    const to = requireDate(qs.to, "to");
    const items = await queryRange(pk, `N#${from}`, `N#${nextDay(to)}`);
    return json(200, { items: items.map(publicMeal) });
  }

  if (parts[0] === "nutrition" && parts.length === 2) {
    const date = requireDate(dateParam, "date");
    if (method === "POST") {
      const meal = normalizeMeal(parseBody(event), date, newId());
      return json(201, await putMeal(pk, meal));
    }
    if (method === "DELETE") {
      const items = await queryPrefix(pk, `N#${date}#`);
      await Promise.all(
        items.map((item) =>
          ddb.send(
            new DeleteCommand({
              TableName: TABLE_NAME,
              Key: { PK: item.PK, SK: item.SK }
            })
          )
        )
      );
      return json(200, { ok: true, deleted: items.length });
    }
  }

  if (parts[0] === "nutrition" && parts.length === 3) {
    const date = requireDate(dateParam, "date");
    const id = decodeURIComponent(idParam || parts[2]);
    if (method === "PUT") {
      const meal = normalizeMeal(parseBody(event), date, id);
      return json(200, await putMeal(pk, meal));
    }
    if (method === "DELETE") {
      await ddb.send(
        new DeleteCommand({
          TableName: TABLE_NAME,
          Key: { PK: pk, SK: `N#${date}#${id}` }
        })
      );
      return json(200, { ok: true });
    }
  }

  if (parts[0] === "workouts" && parts.length === 1 && method === "GET") {
    const from = requireDate(qs.from, "from");
    const to = requireDate(qs.to, "to");
    const items = await queryRange(pk, `W#${from}`, `W#${to}`);
    return json(200, { items: items.map(publicWorkout) });
  }

  if (parts[0] === "workouts" && parts.length === 2) {
    const date = requireDate(dateParam, "date");
    if (method === "GET") {
      const res = await ddb.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: { PK: pk, SK: `W#${date}` }
        })
      );
      return json(200, res.Item ? publicWorkout(res.Item) : { date, flags: Object.assign({}, EMPTY_FLAGS), sets: [] });
    }
    if (method === "PUT") {
      return json(200, await putWorkout(pk, normalizeWorkout(parseBody(event), date)));
    }
    if (method === "DELETE") {
      await ddb.send(
        new DeleteCommand({
          TableName: TABLE_NAME,
          Key: { PK: pk, SK: `W#${date}` }
        })
      );
      return json(200, { ok: true });
    }
  }

  return json(404, { error: "Not found" });
}

export async function handler(event) {
  try {
    return await dispatch(event);
  } catch (err) {
    const statusCode = err.statusCode || 500;
    console.error(err);
    return json(statusCode, { error: err.message || "Internal error" });
  }
}
