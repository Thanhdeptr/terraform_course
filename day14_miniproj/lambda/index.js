const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  DeleteCommand,
  QueryCommand
} = require("@aws-sdk/lib-dynamodb");

const TABLE_NAME = process.env.TABLE_NAME;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
  return (crypto.randomUUID && crypto.randomUUID()) || `id_${Date.now()}`;
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
    ExpressionAttributeValues: { ":pk": pk, ":sk": prefix }
  });
}

async function queryRange(pk, startSk, endSk) {
  return queryAll({
    TableName: TABLE_NAME,
    KeyConditionExpression: "PK = :pk AND SK BETWEEN :start AND :end",
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
  return {
    id: item.id,
    date: item.date,
    type: item.type,
    name: item.name,
    calories: item.calories,
    protein: item.protein
  };
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
  return {
    id,
    date,
    type: String(body.type || "Snack"),
    name,
    calories,
    protein
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
        protein: meal.protein
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

exports.handler = async function handler(event) {
  try {
    return await dispatch(event);
  } catch (err) {
    const statusCode = err.statusCode || 500;
    console.error(err);
    return json(statusCode, { error: err.message || "Internal error" });
  }
};
