import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { ApiError, apiFetch } from "../api/client.js";
import {
  clearToken,
  fetchMe,
  getRefreshToken,
  getToken,
  login as loginRequest,
  logoutEverywhere,
  clearPostLoginRedirect,
  PendingVerificationError,
  refreshSession,
  register as registerRequest,
  setPostLoginRedirect,
  takePostLoginRedirect,
} from "./auth.js";

const AuthContext = createContext(null);

/** Single-flight refresh shared across concurrent requests (no loops). */
let refreshPromise = null;

async function refreshOnce() {
  if (!refreshPromise) {
    refreshPromise = refreshSession().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  const userRef = useRef(null);
  userRef.current = user;

  const loadMe = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return null;
    }
    setLoading(true);
    try {
      const me = await fetchMe();
      // A restored session for an unverified account is NOT treated as
      // authenticated: verification must complete first (backend
      // marketplaces endpoints require ACTIVE via require_active_user).
      if (me && me.status === "PENDING_VERIFICATION") {
        clearToken();
        setUser(null);
        return null;
      }
      setUser(me);
      setAuthError(null);
      return me;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401 && getRefreshToken()) {
        try {
          await refreshOnce();
          const me = await fetchMe();
          if (me && me.status === "PENDING_VERIFICATION") {
            clearToken();
            setUser(null);
            return null;
          }
          setUser(me);
          return me;
        } catch {
          /* refresh failed below */
        }
      }
      clearToken();
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  /** Authenticated fetch: one refresh + one retry, then give up (no loops). */
  const authFetch = useCallback(
    async (path, options = {}) => {
      try {
        return await apiFetch(path, { ...options, token: getToken() });
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401 || !getRefreshToken()) {
          throw error;
        }
        try {
          await refreshOnce();
        } catch {
          clearToken();
          setUser(null);
          throw new ApiError(401, "Session expired. Please sign in again.");
        }
        return apiFetch(path, { ...options, token: getToken() });
      }
    },
    [],
  );

  const login = useCallback(
    async (email, password) => {
      setAuthError(null);
      try {
        await loginRequest(email, password);
        const me = await fetchMe();
        // The backend issues tokens to PENDING_VERIFICATION accounts so
        // the client can drive verification UX — but no marketplace
        // session is created until the account is verified.
        if (me && me.status === "PENDING_VERIFICATION") {
          clearToken();
          setUser(null);
          throw new PendingVerificationError(email);
        }
        setUser(me);
        return me;
      } catch (error) {
        setAuthError(error);
        throw error;
      }
    },
    [],
  );

  const register = useCallback(async (email, password) => {
    setAuthError(null);
    try {
      // Backend contract: 201 { status: PENDING_VERIFICATION,
      // verification_token }, no tokens issued. Any pre-existing session
      // (e.g. another user) is dropped so the new account cannot inherit it.
      const reg = await registerRequest(email, password);
      clearToken();
      setUser(null);
      return reg;
    } catch (error) {
      setAuthError(error);
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutEverywhere();
    } finally {
      // Full client auth teardown: tokens (logoutEverywhere), cached
      // user, errors, and any stored post-login destination. Per-user
      // UI state (e.g. favorites) reloads off isAuthenticated downstream.
      setUser(null);
      setAuthError(null);
      clearPostLoginRedirect();
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: user !== null,
      loading,
      authError,
      login,
      register,
      logout,
      reloadUser: loadMe,
      authFetch,
      redirectToLogin: () => {
        setPostLoginRedirect(window.location.hash);
        window.location.hash = "#/login";
      },
      consumeRedirect: takePostLoginRedirect,
    }),
    [user, loading, authError, login, register, logout, loadMe, authFetch],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider.");
  return context;
}

/** Human-readable message for auth form errors (never leaks stack traces). */
export function describeAuthError(error) {
  if (error?.name === "PendingVerificationError") {
    return "This account needs email verification before logging in. Use the verification step below.";
  }
  if (error instanceof ApiError) {
    if (error.status === 401) return "Invalid email or password, or the session expired.";
    if (error.status === 403) return typeof error.detail === "string" ? error.detail : "This account is restricted.";
    if (error.status === 409) {
      return typeof error.detail === "string" ? error.detail : "This email is already registered.";
    }
    if (error.status === 422) {
      const detail = error.detail;
      if (Array.isArray(detail)) {
        return detail.map((d) => d.msg ?? JSON.stringify(d)).join(" ");
      }
      return typeof detail === "string" ? detail : "Please check the form values.";
    }
    return `Request failed (${error.status}). Please try again.`;
  }
  return "Network error. Is the server running?";
}
