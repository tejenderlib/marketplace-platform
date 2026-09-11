import { ApiError, apiFetch } from "../api/client.js";

const TOKEN_KEY = "mp_access_token";
const REFRESH_KEY = "mp_refresh_token";
const NEXT_KEY = "mp_post_login_redirect";

export function getToken() {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function getRefreshToken() {
  try {
    return window.localStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

export function setRefreshToken(token) {
  if (token) {
    window.localStorage.setItem(REFRESH_KEY, token);
  } else {
    window.localStorage.removeItem(REFRESH_KEY);
  }
}

export function clearToken() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_KEY);
}

export function setPostLoginRedirect(hash) {
  try {
    if (hash && hash !== "#/login" && hash !== "#/register") {
      window.sessionStorage.setItem(NEXT_KEY, hash);
    }
  } catch {
    /* storage unavailable */
  }
}

export function takePostLoginRedirect() {
  try {
    const next = window.sessionStorage.getItem(NEXT_KEY);
    window.sessionStorage.removeItem(NEXT_KEY);
    return next && next.startsWith("#/") ? next : "#/";
  } catch {
    return "#/";
  }
}

export async function login(email, password) {
  const data = await apiFetch("/auth/login", {
    method: "POST",
    body: { email, password },
  });
  setToken(data.access_token);
  setRefreshToken(data.refresh_token);
  return data;
}

export async function register(email, password) {
  return apiFetch("/auth/register", {
    method: "POST",
    body: { email, password },
  });
}

export async function refreshSession() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    throw new ApiError(401, "No refresh token available.");
  }
  const data = await apiFetch("/auth/refresh", {
    method: "POST",
    body: { refresh_token: refreshToken },
  });
  setToken(data.access_token);
  if (data.refresh_token) setRefreshToken(data.refresh_token);
  return data;
}

export function logout() {
  clearToken();
}

/** Server-side logout (revokes the refresh token), then clears local state. */
export async function logoutEverywhere() {
  const accessToken = getToken();
  const refreshToken = getRefreshToken();
  try {
    if (accessToken && refreshToken) {
      await apiFetch("/auth/logout", {
        method: "POST",
        token: accessToken,
        body: { refresh_token: refreshToken },
      });
    }
  } finally {
    clearToken();
  }
}

export async function fetchMe() {
  const token = getToken();
  if (!token) return null;
  return apiFetch("/auth/me", { token });
}

export { ApiError };
