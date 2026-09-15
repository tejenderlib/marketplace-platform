import { useCallback, useEffect, useState } from "react";

import { ApiError } from "../api/client.js";
import { listNotifications, markAllRead, markRead } from "../api/notifications.js";
import { useAuth } from "../auth/AuthContext.jsx";

const LIMIT = 20;

function formatWhen(value) {
  const then = new Date(value);
  const now = new Date();
  const diffSeconds = Math.round((now - then) / 1000);
  if (Number.isNaN(diffSeconds)) return "";
  if (diffSeconds < 60) return "just now";
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
  return then.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
}

function linkTarget(link) {
  if (!link) return null;
  if (link.startsWith("#/")) return link;
  if (link.startsWith("/")) return `#${link}`;
  return null;
}

/** Dropdown listing the newest notifications with mark-read and view-all. */
export default function NotificationPanel({ onClose, onCountChange, initialError }) {
  const { authFetch } = useAuth();
  const [state, setState] = useState({ loading: true, error: initialError, items: [], total: 0 });
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await listNotifications(authFetch, { limit: LIMIT, offset: 0 });
      setState({ loading: false, error: null, items: data.items, total: data.total });
    } catch (err) {
      setState({
        loading: false,
        error: err instanceof ApiError ? `Could not load notifications (${err.status}).` : "Network error.",
        items: [],
        total: 0,
      });
    }
  }, [authFetch]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRead(id) {
    if (busyId) return;
    setBusyId(id);
    try {
      await markRead(authFetch, id);
      setState((s) => ({
        ...s,
        items: s.items.map((item) => (item.id === id ? { ...item, is_read: true } : item)),
      }));
      onCountChange?.((value) => Math.max(0, value - 1));
    } catch {
      /* panel refresh handles state on close */
    } finally {
      setBusyId(null);
    }
  }

  async function handleMarkAll() {
    if (busyId) return;
    setBusyId("__all__");
    try {
      await markAllRead(authFetch);
      setState((s) => ({ ...s, items: s.items.map((item) => ({ ...item, is_read: true })) }));
      onCountChange?.(0);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="notification-panel" role="dialog" aria-label="Notifications">
      <div className="notification-panel-head">
        <strong>Notifications</strong>
        <span className="muted small">
          {state.items.some((item) => !item.is_read) ? (
            <button type="button" className="link-like" onClick={handleMarkAll} disabled={!!busyId}>
              Mark all read
            </button>
          ) : (
            "All caught up"
          )}
        </span>
      </div>

      {state.loading && <p className="muted small" role="status">Loading…</p>}
      {!state.loading && state.error && (
        <p className="notification-error small" role="alert">{state.error}</p>
      )}
      {!state.loading && !state.error && state.items.length === 0 && (
        <p className="muted small">No notifications yet.</p>
      )}
      {state.items.length > 0 && (
        <ul className="notification-list">
          {state.items.map((item) => {
            const href = linkTarget(item.link);
            const inner = (
              <button
                type="button"
                className={item.is_read ? "notification-item is-read" : "notification-item"}
                onClick={() => {
                  if (!item.is_read) handleRead(item.id);
                  if (href) {
                    window.location.hash = href;
                    onClose?.();
                  }
                }}
                disabled={busyId === item.id}
              >
                <span className="notification-title">{item.type.replaceAll("_", " ")}</span>
                <span className="notification-body">{item.title}</span>
                {item.body && <span className="notification-text">{item.body}</span>}
                <span className="muted small">{formatWhen(item.created_at)}</span>
              </button>
            );
            return <li key={item.id}>{inner}</li>;
          })}
        </ul>
      )}

      <div className="notification-panel-foot">
        <a href="#/notifications" onClick={onClose}>View all</a>
      </div>
    </div>
  );
}