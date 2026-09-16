import { useCallback, useEffect, useState } from "react";

import { ApiError, apiFetch } from "../../api/client.js";
import { getToken } from "../../auth/auth.js";
import Button from "../../components/ui/Button.jsx";
import Pill from "../../components/ui/Pill.jsx";
import { EmptyState as CEEmpty, ErrorState as CEError, LoadingState as CELoading } from "../../components/ui/States.jsx";

/** Fetch helper with loading/error/empty handling for admin pages. Logic unchanged. */
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
  return <CELoading label={label} />;
}

export function ErrorState({ message, onRetry }) {
  return <CEError message={message} onRetry={onRetry} />;
}

export function EmptyState({ message = "Nothing here yet." }) {
  return <CEEmpty title={message} />;
}

export function StatCard({ label, value }) {
  return (
    <div className="ce-card ce-card--pad-sm">
      <p className="ce-price ce-tnum">{value}</p>
      <p className="ce-small ce-muted">{label}</p>
    </div>
  );
}

export function Pagination({ total, limit, offset, onChange }) {
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.max(1, Math.ceil(total / limit));
  return (
    <div className="ce-pagination">
      <Button
        variant="ghost"
        size="sm"
        disabled={offset === 0}
        onClick={() => onChange(Math.max(0, offset - limit))}
        aria-label="Previous page"
      >
        ← Prev
      </Button>
      <span className="ce-small ce-muted ce-tnum" aria-live="polite">
        Page {page} of {pages} · {total} total
      </span>
      <Button
        variant="ghost"
        size="sm"
        disabled={offset + limit >= total}
        onClick={() => onChange(offset + limit)}
        aria-label="Next page"
      >
        Next →
      </Button>
    </div>
  );
}

export function FilterBar({ children, onSubmit }) {
  return (
    <form
      className="ce-filter-bar"
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
    <label className="ce-field">
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
    <label className="ce-field">
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

/** Status pill with readable text (never color-only). Raw value shown. */
export function StatusPill({ value }) {
  return <Pill status={value}>{value ?? "—"}</Pill>;
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
      className={feedback.kind === "ok" ? "ce-notice" : "ce-notice ce-notice--error"}
      role={feedback.kind === "ok" ? "status" : "alert"}
    >
      <span>{feedback.message}</span>
      {feedback.kind === "session" ? (
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            import("../../auth/auth.js").then(({ clearToken }) => {
              clearToken();
              window.location.reload();
            });
          }}
        >
          Sign in again
        </Button>
      ) : (
        <button type="button" className="ce-btn ce-btn--ghost ce-btn--sm" onClick={onDismiss} aria-label="Dismiss">
          ✕
        </button>
      )}
    </div>
  );
}
