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
  const bellBtnRef = useRef(null);

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
        window.dispatchEvent(new CustomEvent("notifications-updated"));
      }
    },
    onAuthError: () => {
      setError("Live updates unavailable (session expired). Refresh the page after signing in again.");
    },
  });

  useEffect(() => {
    if (!open) return undefined;
    function onDocClick(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }
    function onKey(event) {
      if (event.key === "Escape") {
        setOpen(false);
        bellBtnRef.current?.focus();
      }
    }
    function onHashChange() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener("hashchange", onHashChange);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("hashchange", onHashChange);
    };
  }, [open]);

  if (!isAuthenticated) return null;

  return (
    <div className="notification-bell" ref={rootRef}>
      <button
        type="button"
        ref={bellBtnRef}
        className={open ? "bell-btn is-open" : "bell-btn"}
        aria-label={open ? "Close notifications" : `Notifications${unread ? ` (${unread} unread)` : ""}`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M18 8.5a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" />
          <path d="M13.7 20a2 2 0 0 1-3.4 0" />
        </svg>
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