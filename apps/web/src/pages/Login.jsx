import { useState } from "react";

import { describeAuthError, useAuth } from "../auth/AuthContext.jsx";
import {
  resendVerification,
  takePostLoginRedirect,
  verifyEmail,
} from "../auth/auth.js";
import { ROUTES } from "../config/routes.js";

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // Set when the backend accepts the credentials but the account is
  // still PENDING_VERIFICATION: no session is created until verified.
  const [pendingEmail, setPendingEmail] = useState(null);
  const [verifyToken, setVerifyToken] = useState(null);
  const [tokenInput, setTokenInput] = useState("");
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyError, setVerifyError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
      window.location.hash = takePostLoginRedirect();
    } catch (err) {
      if (err?.name === "PendingVerificationError") {
        setPendingEmail(err.email ?? email.trim());
        setVerifyToken(null);
        setTokenInput("");
        setVerifyError(null);
      } else {
        setError(describeAuthError(err));
      }
    } finally {
      setBusy(false);
    }
  }

  async function resend(e) {
    e.preventDefault();
    if (verifyBusy) return;
    setVerifyBusy(true);
    setVerifyError(null);
    try {
      // V1 has no mailer: the fresh token is returned in the response.
      const data = await resendVerification(pendingEmail);
      if (data?.verification_token) {
        setVerifyToken(data.verification_token);
      } else {
        setVerifyError("No pending verification found for this account. Try logging in again.");
      }
    } catch (err) {
      setVerifyError(describeAuthError(err));
    } finally {
      setVerifyBusy(false);
    }
  }

  async function verifyAndLogin(e) {
    e.preventDefault();
    if (verifyBusy) return;
    setVerifyBusy(true);
    setVerifyError(null);
    try {
      await verifyEmail((tokenInput || verifyToken || "").trim());
      await login(pendingEmail, password);
      window.location.hash = takePostLoginRedirect();
    } catch (err) {
      setVerifyError(describeAuthError(err));
    } finally {
      setVerifyBusy(false);
    }
  }

  if (pendingEmail) {
    return (
      <div className="auth-wrap">
        <form className="auth-card" onSubmit={verifyAndLogin} noValidate>
          <p className="eyebrow">One more step</p>
          <h1>Verify your email</h1>
          <p className="muted small">
            <strong>{pendingEmail}</strong> is registered but not verified yet.
            No marketplace session is created until verification completes.
            This deployment has no mail service, so request a code and enter
            the verification token below.
          </p>
          {!verifyToken && (
            <button
              type="button"
              className="btn btn-ghost btn-block"
              onClick={resend}
              disabled={verifyBusy}
            >
              {verifyBusy ? "Sending…" : "Send verification code"}
            </button>
          )}
          {verifyToken && (
            <>
              <p className="muted small mono">{verifyToken}</p>
              <label>
                <span>Verification token</span>
                <input
                  type="text"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder={verifyToken}
                  autoComplete="one-time-code"
                />
              </label>
            </>
          )}
          {verifyError && (
            <p className="form-error" role="alert">
              {verifyError}
            </p>
          )}
          {verifyToken && (
            <button type="submit" className="btn btn-primary btn-block" disabled={verifyBusy}>
              {verifyBusy ? "Verifying…" : "Verify and log in"}
            </button>
          )}
          <p className="muted">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setPendingEmail(null);
                setVerifyToken(null);
                setVerifyError(null);
              }}
            >
              Back to login
            </button>
          </p>
        </form>
      </div>
    );
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
          <a href={ROUTES.buy}>Back to marketplace</a>
        </p>
      </form>
    </div>
  );
}
