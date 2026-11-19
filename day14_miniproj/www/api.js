const API_BASE = window.COMMITFIT_API_BASE || "";
const MIGRATED_PREFIX = "commitfit_migrated_";
const LOCAL_OWNER_KEY = "commitfit_local_owner";
const TOKEN_KEYS = {
  id: "commitfit_id_token",
  access: "commitfit_access_token",
  refresh: "commitfit_refresh_token",
  name: "commitfit_display_name"
};

const CommitFitApi = (function () {
  let refreshPromise = null;

  function cognitoConfig() {
    const cfg = window.COMMITFIT_COGNITO || {};
    return {
      region: cfg.region || "",
      clientId: cfg.clientId || "",
      userPoolId: cfg.userPoolId || ""
    };
  }

  function authConfigured() {
    const cfg = cognitoConfig();
    return !!(cfg.region && cfg.clientId);
  }

  function getStored(key) {
    return localStorage.getItem(key) || "";
  }

  function setStored(key, value) {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
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

  function displayNameFrom(claims) {
    const fromToken = String((claims && (claims.name || claims.given_name)) || "").trim();
    if (fromToken) return fromToken;
    return getStored(TOKEN_KEYS.name) || "Account";
  }

  function currentUser() {
    const claims = decodeJwt(getStored(TOKEN_KEYS.id));
    if (!claims || !claims.sub) return null;
    return {
      sub: String(claims.sub),
      email: claims.email || claims.username || "",
      name: displayNameFrom(claims)
    };
  }

  function enabled() {
    if (!API_BASE) return false;
    if (authConfigured()) return !!(getStored(TOKEN_KEYS.refresh) || getStored(TOKEN_KEYS.id));
    return true;
  }

  function cognitoMessage(data) {
    const type = String((data && data.__type) || "").split("#").pop();
    const message = (data && (data.message || data.Message)) || "";
    if (type === "NotAuthorizedException") return "Incorrect email or password.";
    if (type === "UserNotFoundException") return "Incorrect email or password.";
    if (type === "UserNotConfirmedException") return "Confirm your email with the code we sent.";
    if (type === "UsernameExistsException") return "That email is already registered.";
    if (type === "CodeMismatchException") return "That confirmation code is not valid.";
    if (type === "ExpiredCodeException") return "That confirmation code has expired.";
    if (type === "InvalidPasswordException") {
      return "Password must be at least 8 characters, with a letter and a number.";
    }
    if (type === "InvalidParameterException") return message || "Check the form and try again.";
    if (type === "LimitExceededException" || type === "TooManyRequestsException") {
      return "Too many attempts. Wait a moment and try again.";
    }
    return message || "Authentication failed.";
  }

  async function cognito(target, body) {
    const cfg = cognitoConfig();
    if (!cfg.region || !cfg.clientId) throw new Error("Auth is not configured");
    const res = await fetch(`https://cognito-idp.${cfg.region}.amazonaws.com/`, {
      method: "POST",
      headers: {
        "content-type": "application/x-amz-json-1.1",
        "x-amz-target": `AWSCognitoIdentityProviderService.${target}`
      },
      body: JSON.stringify(body)
    });
    const text = await res.text();
    let data = {};
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (err) {
        data = { message: text };
      }
    }
    if (!res.ok) {
      const error = new Error(cognitoMessage(data));
      error.code = String(data.__type || "").split("#").pop();
      error.status = res.status;
      throw error;
    }
    return data;
  }

  function saveTokens(result) {
    const auth = result && result.AuthenticationResult;
    if (!auth) throw new Error("Sign in did not return tokens.");
    setStored(TOKEN_KEYS.id, auth.IdToken);
    setStored(TOKEN_KEYS.access, auth.AccessToken);
    if (auth.RefreshToken) setStored(TOKEN_KEYS.refresh, auth.RefreshToken);
    const claims = decodeJwt(auth.IdToken);
    const name = displayNameFrom(claims);
    if (name && name !== "Account") setStored(TOKEN_KEYS.name, name);
  }

  function clearTokens() {
    setStored(TOKEN_KEYS.id, "");
    setStored(TOKEN_KEYS.access, "");
    setStored(TOKEN_KEYS.refresh, "");
    setStored(TOKEN_KEYS.name, "");
  }

  function clearLocalAppData() {
    const remove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (
        key === "nutrition_goals" ||
        key === "workout_settings" ||
        key === "workout_catalog" ||
        key === LOCAL_OWNER_KEY ||
        key.indexOf("nutrition_logs_") === 0 ||
        key.indexOf("workout_logs_") === 0 ||
        key.indexOf(MIGRATED_PREFIX) === 0
      ) {
        remove.push(key);
      }
    }
    remove.forEach((key) => localStorage.removeItem(key));
  }

  function notifyAuth() {
    window.dispatchEvent(new CustomEvent("commitfit-auth"));
  }

  async function refreshTokens() {
    const refreshToken = getStored(TOKEN_KEYS.refresh);
    if (!refreshToken) throw new Error("Not signed in");
    const cfg = cognitoConfig();
    const data = await cognito("InitiateAuth", {
      AuthFlow: "REFRESH_TOKEN_AUTH",
      ClientId: cfg.clientId,
      AuthParameters: { REFRESH_TOKEN: refreshToken }
    });
    saveTokens(data);
    return getStored(TOKEN_KEYS.id);
  }

  async function getValidIdToken() {
    if (!authConfigured()) return "";
    const idToken = getStored(TOKEN_KEYS.id);
    if (idToken && tokenSecondsLeft(idToken) > 60) return idToken;
    if (!getStored(TOKEN_KEYS.refresh)) return "";
    if (!refreshPromise) {
      refreshPromise = refreshTokens().finally(() => {
        refreshPromise = null;
      });
    }
    try {
      return await refreshPromise;
    } catch (err) {
      clearTokens();
      notifyAuth();
      return "";
    }
  }

  async function signUp(email, password, name) {
    const cfg = cognitoConfig();
    const username = String(email || "").trim().toLowerCase();
    const displayName = String(name || "").trim();
    if (displayName) setStored(TOKEN_KEYS.name, displayName);
    const userAttributes = [{ Name: "email", Value: username }];
    if (displayName) userAttributes.push({ Name: "name", Value: displayName });
    return cognito("SignUp", {
      ClientId: cfg.clientId,
      Username: username,
      Password: password,
      UserAttributes: userAttributes
    });
  }

  async function confirmSignUp(email, code) {
    const cfg = cognitoConfig();
    const username = String(email || "").trim().toLowerCase();
    return cognito("ConfirmSignUp", {
      ClientId: cfg.clientId,
      Username: username,
      ConfirmationCode: String(code || "").trim()
    });
  }

  async function resendCode(email) {
    const cfg = cognitoConfig();
    const username = String(email || "").trim().toLowerCase();
    return cognito("ResendConfirmationCode", {
      ClientId: cfg.clientId,
      Username: username
    });
  }

  async function signIn(email, password) {
    const cfg = cognitoConfig();
    const username = String(email || "").trim().toLowerCase();
    const data = await cognito("InitiateAuth", {
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: cfg.clientId,
      AuthParameters: {
        USERNAME: username,
        PASSWORD: password
      }
    });
    if (data.ChallengeName) {
      const error = new Error("This account needs an extra step we do not support yet.");
      error.code = data.ChallengeName;
      throw error;
    }
    saveTokens(data);
    notifyAuth();
    return currentUser();
  }

  async function forgotPassword(email) {
    const cfg = cognitoConfig();
    const username = String(email || "").trim().toLowerCase();
    return cognito("ForgotPassword", {
      ClientId: cfg.clientId,
      Username: username
    });
  }

  async function confirmForgotPassword(email, code, newPassword) {
    const cfg = cognitoConfig();
    const username = String(email || "").trim().toLowerCase();
    return cognito("ConfirmForgotPassword", {
      ClientId: cfg.clientId,
      Username: username,
      ConfirmationCode: String(code || "").trim(),
      Password: newPassword
    });
  }

  function signOut() {
    clearTokens();
    clearLocalAppData();
    notifyAuth();
  }

  function markLocalOwner() {
    const user = currentUser();
    if (user) localStorage.setItem(LOCAL_OWNER_KEY, user.sub);
  }

  function migratedKey() {
    const user = currentUser();
    return user ? `${MIGRATED_PREFIX}${user.sub}` : `${MIGRATED_PREFIX}anon`;
  }

  async function api(path, options) {
    if (!API_BASE) throw new Error("API is not configured");
    const opts = options || {};
    const headers = {
      "content-type": "application/json",
      ...(opts.headers || {})
    };
    const idToken = await getValidIdToken();
    if (idToken) headers.authorization = `Bearer ${idToken}`;

    const res = await fetch(`${API_BASE}${path}`, {
      method: opts.method || "GET",
      cache: "no-store",
      headers,
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
    if (res.status === 401 && !opts._retried && getStored(TOKEN_KEYS.refresh)) {
      try {
        await refreshTokens();
        return api(path, Object.assign({}, opts, { _retried: true }));
      } catch (err) {
        clearTokens();
        notifyAuth();
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
    const user = currentUser();
    if (!user) return false;
    if (localStorage.getItem(migratedKey()) === "true") return false;

    const owner = localStorage.getItem(LOCAL_OWNER_KEY);
    if (owner && owner !== user.sub) {
      localStorage.setItem(migratedKey(), "true");
      return false;
    }

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
            protein: meal.protein,
            carbs: meal.carbs != null ? meal.carbs : 0,
            fat: meal.fat != null ? meal.fat : 0
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

    localStorage.setItem(migratedKey(), "true");
    markLocalOwner();
    return true;
  }

  return {
    enabled,
    api,
    migrateLocalDataIfNeeded,
    authConfigured,
    currentUser,
    signIn,
    signUp,
    confirmSignUp,
    resendCode,
    forgotPassword,
    confirmForgotPassword,
    signOut,
    markLocalOwner,
    clearLocalAppData
  };
})();

window.CommitFitApi = CommitFitApi;
