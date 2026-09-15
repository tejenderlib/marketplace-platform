import { useEffect, useRef, useState } from "react";

import { getToken } from "../auth/auth.js";

const WS_BASE = import.meta.env.VITE_WS_URL ?? "ws://localhost:8000/ws/notifications";

/**
 * Connect a per-user notification WebSocket and invoke `onEvent` for each
 * pushed notification payload. Reconnects with exponential backoff (1s…30s)
 * while enabled. The socket only lives while a valid access token exists.
 *
 * Authentication uses a one-time handshake message right after connecting
 * ({"type": "auth", "token": ...}) so the access token never appears in
 * the URL, server access logs, or browser history.
 *
 * @param {boolean} enabled  - connect only while user is authenticated
 * @param {(event: object) => void} onEvent - called for each { event, data }
 * @returns {{ connected: boolean }}
 */
export function useNotificationSocket({ enabled, onEvent } = {}) {
  const [connected, setConnected] = useState(false);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const socketRef = useRef(null);

  useEffect(() => {
    if (!enabled) {
      setConnected(false);
      return undefined;
    }

    let disposed = false;
    let attempts = 0;
    let retryTimer = null;

    function scheduleRetry() {
      const delay = Math.min(1000 * 2 ** attempts, 30000);
      attempts += 1;
      retryTimer = setTimeout(open, delay);
    }

    function open() {
      if (disposed) return;
      const token = getToken();
      if (!token) {
        setConnected(false);
        return;
      }
      const socket = new WebSocket(WS_BASE);
      socketRef.current = socket;

      socket.addEventListener("open", () => {
        if (disposed) return;
        socket.send(JSON.stringify({ type: "auth", token }));
      });

      socket.addEventListener("message", (message) => {
        try {
          const event = JSON.parse(message.data);
          onEventRef.current?.(event);
        } catch {
          /* ignore malformed frames */
        }
      });

      socket.addEventListener("close", () => {
        socketRef.current = null;
        if (!disposed) {
          setConnected(false);
          scheduleRetry();
        }
      });
      socket.addEventListener("error", () => {
        socket.close();
      });
    }

    open();
    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      const socket = socketRef.current;
      if (socket) {
        socketRef.current = null;
        socket.close();
      }
      setConnected(false);
    };
  }, [enabled]);

  return { connected };
}