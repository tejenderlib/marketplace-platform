import { useCallback, useEffect, useState } from "react";

import { ApiError } from "../api/client.js";
import { listNotifications, markRead } from "../api/notifications.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { dayGroup } from "../components/chat/format.js";
import Button from "../components/ui/Button.jsx";
import Pill from "../components/ui/Pill.jsx";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/States.jsx";

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

function typeLabel(type) {
  return String(type ?? "").replaceAll("_", " ");
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
    return <p className="ce-small ce-muted">Redirecting to login…</p>;
  }

  const page = Math.floor(offset / LIMIT) + 1;
  const pages = Math.max(1, Math.ceil(state.total / LIMIT));

  return (
    <div className="ce-stack">
      <div>
        <p className="ce-micro ce-muted">Activity</p>
        <h1 className="ce-h1">Notifications</h1>
      </div>
      {state.loading && <LoadingState label="Loading notifications…" />}
      {!state.loading && state.error && (
        <ErrorState message={state.error} onRetry={load} />
      )}
      {!state.loading && !state.error && state.items.length === 0 && (
        <EmptyState
          title="No notifications yet"
          hint="Bids, offers, orders, and moderation updates land here."
          action={<Button variant="secondary" size="sm" href="#/">Browse listings</Button>}
        />
      )}
      {state.items.length > 0 && (
        <>
          {["Today", "Yesterday", "Earlier"].map((group) => {
            const rows = state.items.filter((item) => dayGroup(item.created_at) === group);
            if (rows.length === 0) return null;
            return (
              <section key={group} aria-label={`Notifications from ${group.toLowerCase()}`}>
                <h2 className="ce-h3">{group}</h2>
                <ul className="ce-rows">
                  {rows.map((item) => {
                    const href = linkTarget(item.link);
                    return (
                      <li key={item.id}>
                        <span className="ce-avatar" aria-hidden="true">
                          {item.is_read ? "·" : "●"}
                        </span>
                        <div>
                          <p className="ce-cluster">
                            <Pill status={item.is_read ? "READ" : "PENDING"}>
                              {item.is_read ? "Read" : "Unread"}
                            </Pill>
                            <span className="ce-small ce-muted">{typeLabel(item.type)}</span>
                          </p>
                          <p><strong>{item.title}</strong></p>
                          {item.body && <p className="ce-small ce-muted">{item.body}</p>}
                          <p className="ce-small ce-muted">{formatDateTime(item.created_at)}</p>
                        </div>
                        <span className="ce-cluster">
                          {!item.is_read && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRead(item)}
                              disabled={busyId === item.id}
                              aria-label={`Mark "${item.title}" as read`}
                            >
                              Mark read
                            </Button>
                          )}
                          {href && (
                            <Button variant="secondary" size="sm" href={href}>View</Button>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
          <div className="ce-pagination">
            <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setOffset(offset - LIMIT)} aria-label="Previous page">
              ← Prev
            </Button>
            <span className="ce-small ce-muted ce-tnum" aria-live="polite">Page {page} of {pages}</span>
            <Button variant="ghost" size="sm" disabled={page >= pages} onClick={() => setOffset(offset + LIMIT)} aria-label="Next page">
              Next →
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
