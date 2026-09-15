import { useCallback, useEffect, useState } from "react";

import { ApiError } from "../api/client.js";
import { listNotifications, markRead } from "../api/notifications.js";
import { useAuth } from "../auth/AuthContext.jsx";

const LIMIT = 20;

function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function linkTarget(link) {
  if (!link) return null;
  if (link.startsWith("#/")) return link;
  if (link.startsWith("/")) return `#${link}`;
  return null;
}

export default function NotificationsPage() {
  const { isAuthenticated, authFetch, redirectToLogin } = useAuth();
  const [offset, setOffset] = useState(0);
  const [state, setState] = useState({ loading: true, error: null, items: [], total: 0 });
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setState({ loading: true, error: null, items: [], total: 0 });
    try {
      const data = await listNotifications(authFetch, { limit: LIMIT, offset });
      setState({ loading: false, error: null, items: data.items, total: data.total });
    } catch (err) {
      setState({
        loading: false,
        error: err instanceof ApiError ? `Could not load notifications (${err.status}).` : "Network error.",
        items: [],
        total: 0,
      });
    }
  }, [authFetch, offset]);

  useEffect(() => {
    if (!isAuthenticated) {
      redirectToLogin();
      return;
    }
    load();
  }, [isAuthenticated, load, redirectToLogin]);

  async function handleRead(item) {
    if (busyId) return;
    setBusyId(item.id);
    try {
      await markRead(authFetch, item.id);
      setState((s) => ({ ...s, items: s.items.map((i) => (i.id === item.id ? { ...i, is_read: true } : i)) }));
    } finally {
      setBusyId(null);
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="content">
        <p className="muted">Redirecting to login…</p>
      </div>
    );
  }

  const page = Math.floor(offset / LIMIT) + 1;
  const pages = Math.max(1, Math.ceil(state.total / LIMIT));

  return (
    <div className="content">
      <h1>Notifications</h1>
      {state.loading && <p className="muted" role="status">Loading…</p>}
      {!state.loading && state.error && (
        <div className="empty-state" role="alert">
          <p>{state.error}</p>
          <button type="button" className="btn btn-primary" onClick={load}>Retry</button>
        </div>
      )}
      {!state.loading && !state.error && state.items.length === 0 && (
        <div className="empty-state">
          <p>No notifications yet.</p>
          <a className="btn btn-primary" href="#/">Browse listings</a>
        </div>
      )}
      {state.items.length > 0 && (
        <>
          <ul className="notification-page-list">
            {state.items.map((item) => {
              const href = linkTarget(item.link);
              return (
                <li key={item.id} className={item.is_read ? "notification-row is-read" : "notification-row"}>
                  <div className="notification-row-main">
                    <span className="notification-type pill">{item.type.replaceAll("_", " ")}</span>
                    <strong>{item.title}</strong>
                    {item.body && <p className="muted small">{item.body}</p>}
                    <span className="muted small">{formatDateTime(item.created_at)}</span>
                  </div>
                  <div className="notification-row-actions">
                    {!item.is_read && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleRead(item)}
                        disabled={busyId === item.id}
                      >
                        Mark read
                      </button>
                    )}
                    {href && (
                      <a className="btn btn-primary btn-sm" href={href}>View</a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="pagination storefront-pagination">
            <button type="button" className="btn btn-ghost" disabled={page <= 1} onClick={() => setOffset(offset - LIMIT)}>
              ← Prev
            </button>
            <span>Page {page} of {pages}</span>
            <button type="button" className="btn btn-ghost" disabled={page >= pages} onClick={() => setOffset(offset + LIMIT)}>
              Next →
            </button>
          </div>
        </>
      )}
    </div>
  );
}