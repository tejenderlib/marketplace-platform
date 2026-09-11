import { useCallback, useEffect, useState } from "react";

import { ApiError, apiFetch } from "../../api/client.js";
import { getToken } from "../../auth/auth.js";

/** Fetch helper with loading/error/empty handling for admin pages. */
export function useAdminData(path, query = {}) {
  const [state, setState] = useState({ loading: true, error: null, data: null });

  const load = useCallback(async () => {
    setState({ loading: true, error: null, data: null });
    try {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value !== "" && value !== null && value !== undefined) {
          params.set(key, value);
        }
      }
      const suffix = params.toString() ? `?${params}` : "";
      const data = await apiFetch(`${path}${suffix}`, { token: getToken() });
      setState({ loading: false, error: null, data });
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.status === 403
            ? "Access denied. ADMIN role required."
            : `API error (${error.status}): ${error.message}`
          : "Network error. Is the API running?";
      setState({ loading: false, error: message, data: null });
    }
  }, [path, JSON.stringify(query)]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, reload: load };
}

export function Loading({ label = "Loading…" }) {
  return (
    <div className="admin-state" role="status">
      <p>{label}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="admin-state admin-error" role="alert">
      <p>{message}</p>
      {onRetry && (
        <button type="button" className="btn btn-primary" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({ message = "Nothing here yet." }) {
  return (
    <div className="admin-state">
      <p>{message}</p>
    </div>
  );
}

export function StatCard({ label, value }) {
  return (
    <div className="stat-card">
      <p className="stat-value">{value}</p>
      <p className="stat-label">{label}</p>
    </div>
  );
}

export function Pagination({ total, limit, offset, onChange }) {
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.max(1, Math.ceil(total / limit));
  return (
    <div className="pagination">
      <button
        type="button"
        className="btn btn-ghost"
        disabled={offset === 0}
        onClick={() => onChange(Math.max(0, offset - limit))}
      >
        ← Prev
      </button>
      <span>
        Page {page} of {pages} · {total} total
      </span>
      <button
        type="button"
        className="btn btn-ghost"
        disabled={offset + limit >= total}
        onClick={() => onChange(offset + limit)}
      >
        Next →
      </button>
    </div>
  );
}

export function FilterBar({ children, onSubmit }) {
  return (
    <form
      className="filter-bar"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.();
      }}
    >
      {children}
    </form>
  );
}

export function FilterSelect({ label, value, onChange, options, allLabel = "All" }) {
  return (
    <label className="filter-field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{allLabel}</option>
        {options.map((opt) => (
          <option key={opt.value ?? opt} value={opt.value ?? opt}>
            {opt.label ?? opt}
          </option>
        ))}
      </select>
    </label>
  );
}

export function FilterSearch({ label, value, onChange, placeholder }) {
  return (
    <label className="filter-field filter-search">
      <span>{label}</span>
      <input
        type="search"
        value={value}
        placeholder={placeholder ?? `Search ${label.toLowerCase()}…`}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

export function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** Map admin-action failures to UI handling: session / denied / conflict / error. */
export function describeActionError(error) {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return { kind: "session", message: "Session expired. Please sign in again." };
    }
    if (error.status === 403) {
      return { kind: "denied", message: `Access denied: ${error.message}` };
    }
    if (error.status === 409) {
      return { kind: "conflict", message: error.message };
    }
    return { kind: "error", message: `Request failed (${error.status}): ${error.message}` };
  }
  return { kind: "error", message: "Network error. Is the API running?" };
}

export function ActionFeedback({ feedback, onDismiss }) {
  if (!feedback) return null;
  return (
    <div
      className={feedback.kind === "ok" ? "notice-ok" : "notice-err"}
      role={feedback.kind === "ok" ? "status" : "alert"}
    >
      <span>{feedback.message}</span>
      {feedback.kind === "session" ? (
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => {
            import("../../auth/auth.js").then(({ clearToken }) => {
              clearToken();
              window.location.reload();
            });
          }}
        >
          Sign in again
        </button>
      ) : (
        <button type="button" className="notice-close" onClick={onDismiss} aria-label="Dismiss">
          ✕
        </button>
      )}
    </div>
  );
}
