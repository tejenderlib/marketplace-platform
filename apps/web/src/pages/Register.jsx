import { useState } from "react";

import { describeAuthError, useAuth } from "../auth/AuthContext.jsx";
import { apiFetch, ApiError } from "../api/client.js";
import { login } from "../auth/auth.js";
import { takePostLoginRedirect } from "../auth/auth.js";

export default function RegisterPage() {
  const { register } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [pendingVerification, setPendingVerification] = useState(null);

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const reg = await register(email.trim(), password);
      // Phase 8: accounts start PENDING_VERIFICATION. V1 has no email
      // delivery, so the API returns the verification token directly —
      // complete activation here before entering the marketplace.
      if (reg && reg.verification_token) {
        setPendingVerification(reg.verification_token);
      } else {
        window.location.hash = takePostLoginRedirect();
      }
    } catch (err) {
      setError(describeAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  async function verifyNow(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/auth/verify-email", {
        method: "POST",
        body: { token: pendingVerification },
      });
      await login(email.trim(), password);
      window.location.hash = takePostLoginRedirect();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail || "Verification failed." : "Verification failed.");
    } finally {
      setBusy(false);
    }
  }

  if (pendingVerification) {
    return (
      <div className="auth-wrap">
        <form className="auth-card" onSubmit={verifyNow} noValidate>
          <p className="eyebrow">One more step</p>
          <h1>Verify your email</h1>
          <p className="muted small">
            Your account is created and pending verification. This deployment has
            no mail service, so your verification token is shown here.
          </p>
          <p className="muted small mono">{pendingVerification}</p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? "Verifying…" : "Verify and continue"}
          </button>
          <p className="muted">
            Already verified on another device?{" "}
            <a href="#/login">Log in</a>
          </p>
        </form>
      </div>
    );
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit} noValidate>
        <p className="eyebrow">Join the marketplace</p>
        <h1>Create account</h1>
        <p className="muted small">New accounts get buyer access. No admin self-selection.</p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <label>
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </label>
        <label>
          <span>Password (min. 8 characters, letters + digits)</span>
          <div className="password-row">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </label>
        <label>
          <span>Confirm password</span>
          <input
            type={showPassword ? "text" : "password"}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            autoComplete="new-password"
          />
        </label>
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? "Creating account…" : "Create account"}
        </button>
        <p className="muted">
          Already have an account? <a href="#/login">Log in</a> ·{" "}
          <a href="#/">Back to marketplace</a>
        </p>
      </form>
    </div>
  );
}
