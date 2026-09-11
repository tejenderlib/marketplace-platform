import { useState } from "react";

import { describeAuthError, useAuth } from "../auth/AuthContext.jsx";
import { takePostLoginRedirect } from "../auth/auth.js";

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
      window.location.hash = takePostLoginRedirect();
    } catch (err) {
      setError(describeAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit} noValidate>
        <p className="eyebrow">Welcome back</p>
        <h1>Log in</h1>
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
          <span>Password</span>
          <div className="password-row">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
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
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? "Logging in…" : "Log in"}
        </button>
        <p className="muted">
          New here? <a href="#/register">Create an account</a> ·{" "}
          <a href="#/">Back to marketplace</a>
        </p>
      </form>
    </div>
  );
}
