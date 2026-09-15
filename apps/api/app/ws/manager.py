"""In-process WebSocket connection manager for real-time notification push.

Single-process only (no Redis / Kafka / RabbitMQ). The manager keeps a set of
live websockets per user_id. `notify()` calls `manager.push_to_user()` via a
thread-safe asyncio bridge from its sync context.

Usage from sync code::

    manager.push_to_user(user_id, payload)

The barrier is a threading.Lock wrapping the mapping mutation; the socket
send is scheduled on the running event loop with run_coroutine_threadsafe.
"""

from __future__ import annotations

import asyncio
import logging
import threading
import uuid

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self) -> None:
        self._user_sockets: dict[uuid.UUID, set[WebSocket]] = {}
        self._lock = threading.Lock()

    async def connect(self, user_id: uuid.UUID, websocket: WebSocket) -> None:
        await websocket.accept()
        with self._lock:
            self._user_sockets.setdefault(user_id, set()).add(websocket)

    async def disconnect(self, user_id: uuid.UUID, websocket: WebSocket) -> None:
        with self._lock:
            sockets = self._user_sockets.get(user_id)
            if sockets is not None:
                sockets.discard(websocket)
                if not sockets:
                    self._user_sockets.pop(user_id, None)

    def push_to_user(self, user_id: uuid.UUID, payload: dict) -> None:
        """Schedule an outbound socket send from a sync context (fire-and-forget)."""

        with self._lock:
            sockets = list(self._user_sockets.get(user_id, ()))
        if not sockets:
            return
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None
        for websocket in sockets:
            coro = websocket.send_json(payload)
            if loop is not None:
                asyncio.run_coroutine_threadsafe(coro, loop)
            else:
                # No running loop: use a dedicated thread event loop.
                def _send(c: asyncio.coroutines) -> None:
                    try:
                        asyncio.run(c)
                    except Exception:  # pragma: no cover - defensive
                        logger.exception("WS push failed")
                threading.Thread(target=_send, args=(coro,), daemon=True).start()

    def count_connections(self) -> int:
        with self._lock:
            return sum(len(s) for s in self._user_sockets.values())


manager = ConnectionManager()