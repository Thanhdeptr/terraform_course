(function () {
  const overlay = document.getElementById("auth-overlay");
  const openBtn = document.getElementById("auth-open-btn");
  const closeBtn = document.getElementById("auth-close-btn");
  const signOutBtn = document.getElementById("auth-signout-btn");
  const sessionEl = document.getElementById("auth-session");
  const nameEl = document.getElementById("auth-name");
  const errorEl = document.getElementById("auth-error");
  const copyEl = document.getElementById("auth-copy");
  const titleEl = document.getElementById("auth-title");
  const signInForm = document.getElementById("auth-signin-form");
  const signUpForm = document.getElementById("auth-signup-form");
  const confirmForm = document.getElementById("auth-confirm-form");
  const forgotForm = document.getElementById("auth-forgot-form");
  const resetForm = document.getElementById("auth-reset-form");

  if (!overlay || typeof CommitFitApi === "undefined") return;

  let pendingEmail = "";
  let pendingPassword = "";
  let view = "signin";

  function setError(message) {
    if (!errorEl) return;
    if (!message) {
      errorEl.hidden = true;
      errorEl.textContent = "";
      return;
    }
    errorEl.hidden = false;
    errorEl.textContent = message;
  }

  function setBusy(form, busy) {
    const button = form && form.querySelector("button[type='submit']");
    if (button) button.disabled = !!busy;
  }

  function showView(next) {
    view = next;
    setError("");
    if (signInForm) signInForm.hidden = next !== "signin";
    if (signUpForm) signUpForm.hidden = next !== "signup";
    if (confirmForm) confirmForm.hidden = next !== "confirm";
    if (forgotForm) forgotForm.hidden = next !== "forgot";
    if (resetForm) resetForm.hidden = next !== "reset";

    if (next === "signin") {
      titleEl.textContent = "Sign in";
      copyEl.textContent = "Sync meals and workouts across devices.";
    } else if (next === "signup") {
      titleEl.textContent = "Create account";
      copyEl.textContent = "Use the same email on phone and laptop.";
    } else if (next === "forgot") {
      titleEl.textContent = "Forgot password";
      copyEl.textContent = "We will email a reset code to your verified address.";
    } else if (next === "reset") {
      titleEl.textContent = "Reset password";
      copyEl.textContent = pendingEmail
        ? `Enter the code sent to ${pendingEmail}, then choose a new password.`
        : "Enter the email code and your new password.";
    } else {
      titleEl.textContent = "Confirm email";
      copyEl.textContent = pendingEmail
        ? `Enter the 6-digit code sent to ${pendingEmail}.`
        : "Enter the 6-digit code from your email.";
    }
  }

  function renderSession() {
    const user = CommitFitApi.currentUser();
    if (user) {
      openBtn.hidden = true;
      sessionEl.hidden = false;
      nameEl.textContent = user.name || "Account";
      nameEl.title = user.name || "";
      overlay.hidden = true;
    } else {
      openBtn.hidden = false;
      sessionEl.hidden = true;
      nameEl.textContent = "";
    }
  }

  function openOverlay() {
    showView("signin");
    overlay.hidden = false;
    const emailInput = document.getElementById("auth-signin-email");
    if (emailInput) emailInput.focus();
  }

  function closeOverlay() {
    overlay.hidden = true;
    setError("");
  }

  openBtn.addEventListener("click", openOverlay);
  closeBtn.addEventListener("click", closeOverlay);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeOverlay();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !overlay.hidden) closeOverlay();
  });

  document.querySelectorAll("[data-auth-view]").forEach((el) => {
    el.addEventListener("click", () => showView(el.getAttribute("data-auth-view")));
  });

  signInForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = document.getElementById("auth-signin-email").value.trim();
    const password = document.getElementById("auth-signin-password").value;
    setBusy(signInForm, true);
    setError("");
    try {
      await CommitFitApi.signIn(email, password);
      signInForm.reset();
      closeOverlay();
    } catch (err) {
      if (err && err.code === "UserNotConfirmedException") {
        pendingEmail = email;
        pendingPassword = password;
        showView("confirm");
      } else {
        setError(err.message || "Sign in failed.");
      }
    } finally {
      setBusy(signInForm, false);
    }
  });

  signUpForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = document.getElementById("auth-signup-name").value.trim();
    const email = document.getElementById("auth-signup-email").value.trim();
    const password = document.getElementById("auth-signup-password").value;
    const confirm = document.getElementById("auth-signup-confirm").value;
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(signUpForm, true);
    setError("");
    try {
      await CommitFitApi.signUp(email, password, name);
      pendingEmail = email;
      pendingPassword = password;
      showView("confirm");
    } catch (err) {
      setError(err.message || "Could not create account.");
    } finally {
      setBusy(signUpForm, false);
    }
  });

  confirmForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const code = document.getElementById("auth-confirm-code").value.trim();
    const email = pendingEmail || document.getElementById("auth-signin-email").value.trim();
    setBusy(confirmForm, true);
    setError("");
    try {
      await CommitFitApi.confirmSignUp(email, code);
      if (pendingPassword) await CommitFitApi.signIn(email, pendingPassword);
      pendingPassword = "";
      confirmForm.reset();
      closeOverlay();
    } catch (err) {
      setError(err.message || "Could not confirm account.");
    } finally {
      setBusy(confirmForm, false);
    }
  });

  if (forgotForm) {
    forgotForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const email = document.getElementById("auth-forgot-email").value.trim();
      setBusy(forgotForm, true);
      setError("");
      try {
        await CommitFitApi.forgotPassword(email);
        pendingEmail = email;
        const resetEmail = document.getElementById("auth-reset-email");
        if (resetEmail) resetEmail.value = email;
        showView("reset");
      } catch (err) {
        // Cognito prevent_user_existence_errors: still show success-style next step when possible
        if (err && (err.code === "UserNotFoundException" || err.code === "InvalidParameterException")) {
          pendingEmail = email;
          const resetEmail = document.getElementById("auth-reset-email");
          if (resetEmail) resetEmail.value = email;
          showView("reset");
          copyEl.textContent = pendingEmail
            ? `If an account exists for ${pendingEmail}, a reset code was sent.`
            : "If an account exists, a reset code was sent.";
        } else {
          setError(err.message || "Could not start password reset.");
        }
      } finally {
        setBusy(forgotForm, false);
      }
    });
  }

  if (resetForm) {
    resetForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const email =
        document.getElementById("auth-reset-email").value.trim() || pendingEmail;
      const code = document.getElementById("auth-reset-code").value.trim();
      const password = document.getElementById("auth-reset-password").value;
      const confirm = document.getElementById("auth-reset-confirm").value;
      if (password !== confirm) {
        setError("Passwords do not match.");
        return;
      }
      setBusy(resetForm, true);
      setError("");
      try {
        await CommitFitApi.confirmForgotPassword(email, code, password);
        pendingEmail = email;
        pendingPassword = "";
        await CommitFitApi.signIn(email, password);
        resetForm.reset();
        if (forgotForm) forgotForm.reset();
        closeOverlay();
      } catch (err) {
        setError(err.message || "Could not reset password.");
      } finally {
        setBusy(resetForm, false);
      }
    });
  }

  const resendBtn = document.getElementById("auth-resend-btn");
  if (resendBtn) {
    resendBtn.addEventListener("click", async () => {
      const email = pendingEmail || document.getElementById("auth-signin-email").value.trim();
      if (!email) {
        setError("Enter your email first.");
        return;
      }
      try {
        await CommitFitApi.resendCode(email);
        setError("");
        copyEl.textContent = `A new code was sent to ${email}.`;
      } catch (err) {
        setError(err.message || "Could not resend the code.");
      }
    });
  }

  const resendResetBtn = document.getElementById("auth-resend-reset-btn");
  if (resendResetBtn) {
    resendResetBtn.addEventListener("click", async () => {
      const email =
        (document.getElementById("auth-reset-email") &&
          document.getElementById("auth-reset-email").value.trim()) ||
        pendingEmail ||
        (document.getElementById("auth-forgot-email") &&
          document.getElementById("auth-forgot-email").value.trim());
      if (!email) {
        setError("Enter your email first.");
        return;
      }
      try {
        await CommitFitApi.forgotPassword(email);
        pendingEmail = email;
        setError("");
        copyEl.textContent = `A new reset code was sent to ${email}.`;
      } catch (err) {
        setError(err.message || "Could not resend the reset code.");
      }
    });
  }

  signOutBtn.addEventListener("click", () => {
    CommitFitApi.signOut();
  });

  window.addEventListener("commitfit-auth", renderSession);
  renderSession();
})();
