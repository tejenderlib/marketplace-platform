import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "../api/client.js";
import { unreadCount } from "../api/notifications.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { useNotificationSocket } from "../hooks/useNotificationSocket.js";
import NotificationPanel from "./NotificationPanel.jsx";

/** Bell with a live unread badge. Prefetch + realtime WS refresh, click-to-open. */
export default function NotificationBell() {
  const { isAuthenticated, authFetch } = useAuth();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState(null);
  const rootRef = useRef(null);

  const reload = useCallback(async () => {
    if (!isAuthenticated) {
      setUnread(0);
      return;
    }
    try {
      const data = await unreadCount(authFetch);
      setUnread(data.count ?? 0);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? `Notifications unavailable (${err.status}).` : "Notifications unavailable.");
    }
  }, [isAuthenticated, authFetch]);

  useEffect(() => {
    reload();
  }, [reload]);

  useNotificationSocket({
    enabled: isAuthenticated,
    onEvent: (event) => {
      if (event?.event === "notification" && !event.data?.is_read) {
        setUnread((value) => value + 1);
        if (open) setOpen(false);
      }
    },
  });

  useEffect(() => {
    if (!open) return undefined;
    function onDocClick(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }
    function onHashChange() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    window.addEventListener("hashchange", onHashChange);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      window.removeEventListener("hashchange", onHashChange);
    };
  }, [open]);

  if (!isAuthenticated) return null;

  return (
    <div className="notification-bell" ref={rootRef}>
      <button
        type="button"
        className={open ? "bell-btn is-open" : "bell-btn"}
        aria-label={open ? "Close notifications" : `Notifications${unread ? ` (${unread} unread)` : ""}`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">🔔</span>
        {unread > 0 && <span className="bell-badge" aria-hidden="true">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && (
        <NotificationPanel
          onClose={() => setOpen(false)}
          onCountChange={setUnread}
          initialError={error}
        />
      )}
    </div>
  );
}