// CommitFit — one Scriptable script for login + home-screen widget.
// Setup: copy this file into the Scriptable app, run it once → Sign in.
// Then add a Scriptable widget and pick this script.

const CONFIG = {
  apiBase: "https://r2aztbyze5.execute-api.ap-southeast-1.amazonaws.com",
  region: "ap-southeast-1",
  clientId: "6oatk9tkp0mt8cvj77kea7aeu1",
  siteUrl: "https://devopsminilab.site"
};

const KC = {
  id: "commitfit_id_token",
  refresh: "commitfit_refresh_token",
  name: "commitfit_display_name"
};

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function decodeJwt(token) {
  if (!token) return null;
  try {
    const payload = token.split(".")[1];
    const padded = payload.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(padded));
  } catch (err) {
    return null;
  }
}

function tokenSecondsLeft(token) {
  const claims = decodeJwt(token);
  if (!claims || !claims.exp) return 0;
  return claims.exp - Date.now() / 1000;
}

function kcGet(key) {
  try {
    return Keychain.contains(key) ? Keychain.get(key) : "";
  } catch (err) {
    return "";
  }
}

function kcSet(key, value) {
  if (value) Keychain.set(key, value);
  else if (Keychain.contains(key)) Keychain.remove(key);
}

function clearSession() {
  kcSet(KC.id, "");
  kcSet(KC.refresh, "");
  kcSet(KC.name, "");
}

function displayName() {
  const fromStore = kcGet(KC.name);
  if (fromStore) return fromStore;
  const claims = decodeJwt(kcGet(KC.id));
  return (claims && (claims.name || claims.email)) || "CommitFit";
}

async function cognito(target, body) {
  const req = new Request(`https://cognito-idp.${CONFIG.region}.amazonaws.com/`);
  req.method = "POST";
  req.headers = {
    "content-type": "application/x-amz-json-1.1",
    "x-amz-target": `AWSCognitoIdentityProviderService.${target}`
  };
  req.body = JSON.stringify(body);
  const data = await req.loadJSON();
  if (req.response.statusCode >= 400) {
    const type = String(data.__type || "").split("#").pop();
    const msg = data.message || data.Message || type || "Auth failed";
    throw new Error(msg);
  }
  return data;
}

function saveAuth(result) {
  const auth = result && result.AuthenticationResult;
  if (!auth || !auth.IdToken) throw new Error("Sign in did not return tokens.");
  kcSet(KC.id, auth.IdToken);
  if (auth.RefreshToken) kcSet(KC.refresh, auth.RefreshToken);
  const claims = decodeJwt(auth.IdToken);
  const name = (claims && (claims.name || claims.email)) || "";
  if (name) kcSet(KC.name, name);
}

async function refreshIdToken() {
  const refresh = kcGet(KC.refresh);
  if (!refresh) throw new Error("Not signed in");
  const data = await cognito("InitiateAuth", {
    AuthFlow: "REFRESH_TOKEN_AUTH",
    ClientId: CONFIG.clientId,
    AuthParameters: { REFRESH_TOKEN: refresh }
  });
  saveAuth(data);
  return kcGet(KC.id);
}

async function getValidIdToken() {
  const id = kcGet(KC.id);
  if (id && tokenSecondsLeft(id) > 60) return id;
  if (!kcGet(KC.refresh)) return "";
  try {
    return await refreshIdToken();
  } catch (err) {
    clearSession();
    return "";
  }
}

async function signIn(email, password) {
  const username = String(email || "").trim().toLowerCase();
  const data = await cognito("InitiateAuth", {
    AuthFlow: "USER_PASSWORD_AUTH",
    ClientId: CONFIG.clientId,
    AuthParameters: {
      USERNAME: username,
      PASSWORD: password
    }
  });
  if (data.ChallengeName) {
    throw new Error("This account needs an extra Cognito step.");
  }
  saveAuth(data);
}

async function apiGet(path) {
  const token = await getValidIdToken();
  if (!token) throw new Error("Not signed in");
  const req = new Request(`${CONFIG.apiBase}${path}`);
  req.method = "GET";
  req.headers = {
    authorization: `Bearer ${token}`,
    accept: "application/json"
  };
  const data = await req.loadJSON();
  if (req.response.statusCode >= 400) {
    throw new Error((data && data.error) || `HTTP ${req.response.statusCode}`);
  }
  return data;
}

async function loadToday() {
  const date = todayStr();
  let profile = { calorieGoal: 2000, proteinGoal: 120 };
  try {
    profile = await apiGet("/profile");
  } catch (err) {
    if (!String(err.message || "").includes("404")) {
      /* keep defaults when profile missing */
    }
  }
  const nutrition = await apiGet(`/nutrition?from=${date}&to=${date}`);
  const meals = nutrition.items || [];
  const calories = meals.reduce((sum, m) => sum + Number(m.calories || 0), 0);
  const protein = meals.reduce((sum, m) => sum + Number(m.protein || 0), 0);
  return {
    date,
    calories,
    protein,
    calorieGoal: Number(profile.calorieGoal) || 2000,
    proteinGoal: Number(profile.proteinGoal) || 120,
    mealCount: meals.length,
    name: displayName()
  };
}

const THEME = {
  cream: new Color("#f4f1ea"),
  creamSoft: new Color("#faf7f1"),
  greenLight: new Color("#b8d59d"),
  greenDeep: new Color("#4a7c36"),
  greenSoft: new Color("#d8e8c8"),
  inkMuted: new Color("#6b7d62"),
  warn: new Color("#c47b3a"),
  track: new Color("#e7e1d6")
};

function pctRaw(value, goal) {
  if (!goal) return 0;
  return (Number(value) / Number(goal)) * 100;
}

function pct(value, goal) {
  return Math.min(100, Math.round(pctRaw(value, goal)));
}

function barFillColor(percent) {
  if (percent > 105) return THEME.warn;
  if (percent >= 80) return THEME.greenDeep;
  return THEME.greenLight;
}

function sfIcon(name, size) {
  const symbol = SFSymbol.named(name);
  symbol.applyFont(Font.systemFont(size));
  return symbol.image;
}

function drawRoundedRect(dc, rect, radius, color) {
  const path = new Path();
  path.addRoundedRect(rect, radius, radius);
  dc.setFillColor(color);
  dc.addPath(path);
  dc.fillPath();
}

function drawProgressBar(percent, width, height, fillColor) {
  const dc = new DrawContext();
  dc.size = new Size(width, height);
  dc.opaque = false;
  dc.respectScreenScale = true;

  const radius = height / 2;
  drawRoundedRect(dc, new Rect(0, 0, width, height), radius, THEME.track);

  const ratio = Math.max(0, Math.min(percent / 100, 1));
  const fillWidth = Math.max(ratio > 0 ? height : 0, Math.round(width * ratio));
  if (fillWidth > 0) {
    drawRoundedRect(dc, new Rect(0, 0, fillWidth, height), radius, fillColor);
  }
  return dc.getImage();
}

function widgetBarWidth() {
  const family = config.widgetFamily;
  if (family === "large") return 300;
  if (family === "small") return 135;
  return 220;
}

function applyCreamBackground(widget) {
  const gradient = new LinearGradient();
  gradient.locations = [0, 1];
  gradient.colors = [THEME.creamSoft, THEME.cream];
  widget.backgroundGradient = gradient;
}

function addMetricRow(parent, label, valueText, percent, barWidth) {
  const row = parent.addStack();
  row.layoutVertically();
  row.spacing = 4;

  const top = row.addStack();
  top.layoutHorizontally();
  top.centerAlignContent();

  const labelText = top.addText(label);
  labelText.font = Font.mediumSystemFont(11);
  labelText.textColor = THEME.inkMuted;

  top.addSpacer();

  const value = top.addText(valueText);
  value.font = Font.boldRoundedSystemFont(13);
  value.textColor = THEME.greenDeep;

  const fill = barFillColor(percent);
  const bar = row.addImage(drawProgressBar(Math.min(percent, 100), barWidth, 10, fill));
  bar.imageSize = new Size(barWidth, 10);
  bar.cornerRadius = 5;
  bar.resizable = false;

  const pctLabel = row.addText(`${Math.round(percent)}% of goal`);
  pctLabel.font = Font.systemFont(10);
  pctLabel.textColor = percent > 105 ? THEME.warn : THEME.greenLight;
}

async function buildWidget(data, errorMessage) {
  const w = new ListWidget();
  applyCreamBackground(w);
  w.setPadding(14, 14, 14, 14);
  w.url = CONFIG.siteUrl;

  const header = w.addStack();
  header.layoutHorizontally();
  header.centerAlignContent();

  try {
    const icon = header.addImage(sfIcon("leaf.fill", 16));
    icon.imageSize = new Size(16, 16);
    icon.tintColor = THEME.greenLight;
    icon.resizable = false;
    header.addSpacer(6);
  } catch (err) {
    /* SF Symbol unavailable — title only */
  }

  const title = header.addText("CommitFit");
  title.font = Font.boldRoundedSystemFont(15);
  title.textColor = THEME.greenDeep;

  header.addSpacer();

  if (errorMessage) {
    w.addSpacer(10);
    const err = w.addText(errorMessage);
    err.font = Font.mediumSystemFont(12);
    err.textColor = THEME.warn;
    err.lineLimit = 4;
    w.addSpacer();
    const hint = w.addText("Open Scriptable → run this script → Sign in");
    hint.font = Font.systemFont(10);
    hint.textColor = THEME.inkMuted;
    return w;
  }

  w.addSpacer(12);

  const barWidth = widgetBarWidth();
  const calPct = pctRaw(data.calories, data.calorieGoal);
  const proPct = pctRaw(data.protein, data.proteinGoal);

  addMetricRow(
    w,
    "Calories",
    `${Math.round(data.calories)} / ${data.calorieGoal} kcal`,
    calPct,
    barWidth
  );

  w.addSpacer(10);

  addMetricRow(
    w,
    "Protein",
    `${Number(data.protein).toFixed(1)} / ${data.proteinGoal} g`,
    proPct,
    barWidth
  );

  return w;
}

async function promptSignIn() {
  const alert = new Alert();
  alert.title = "CommitFit Sign in";
  alert.message = "Same Cognito account as the website.";
  alert.addTextField("Email", "");
  alert.addSecureTextField("Password", "");
  alert.addAction("Sign in");
  alert.addCancelAction("Cancel");
  const idx = await alert.presentAlert();
  if (idx !== 0) return false;
  const email = alert.textFieldValue(0);
  const password = alert.textFieldValue(1);
  await signIn(email, password);
  return true;
}

async function presentMenu() {
  const signedIn = !!(kcGet(KC.refresh) || kcGet(KC.id));
  const alert = new Alert();
  alert.title = "CommitFit";
  alert.message = signedIn
    ? `Signed in as ${displayName()}`
    : "Not signed in. Sign in once, then add this script as a widget.";

  if (!signedIn) {
    alert.addAction("Sign in");
    alert.addCancelAction("Cancel");
    const idx = await alert.presentAlert();
    if (idx === 0) {
      await promptSignIn();
      const ok = new Alert();
      ok.title = "Signed in";
      ok.message = `Welcome ${displayName()}. Add a Scriptable widget and choose this script.`;
      ok.addAction("OK");
      await ok.presentAlert();
    }
    return;
  }

  alert.addAction("Preview today");
  alert.addAction("Sign out");
  alert.addCancelAction("Cancel");
  const idx = await alert.presentAlert();
  if (idx === 0) {
    const data = await loadToday();
    const w = await buildWidget(data);
    await w.presentMedium();
  } else if (idx === 1) {
    clearSession();
    const ok = new Alert();
    ok.title = "Signed out";
    ok.message = "Tokens removed from Keychain.";
    ok.addAction("OK");
    await ok.presentAlert();
  }
}

async function run() {
  if (config.runsInWidget) {
    let widget;
    try {
      if (!(await getValidIdToken())) {
        widget = await buildWidget(null, "Not signed in");
      } else {
        const data = await loadToday();
        widget = await buildWidget(data);
      }
    } catch (err) {
      widget = await buildWidget(null, err.message || String(err));
    }
    Script.setWidget(widget);
  } else {
    try {
      await presentMenu();
    } catch (err) {
      const alert = new Alert();
      alert.title = "CommitFit error";
      alert.message = err.message || String(err);
      alert.addAction("OK");
      await alert.presentAlert();
    }
  }
  Script.complete();
}

await run();
