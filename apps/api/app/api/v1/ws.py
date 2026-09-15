"""WebSocket endpoint for real-time notification push.

Connects as:  ws://host/ws/notifications

Authentication uses a short-lived single-message handshake instead of a URL
query parameter, so access tokens never appear in server/proxy access logs
or browser history. The client sends one JSON frame after connecting:

    {"type": "auth", "token": "<access_token>"}

Any other first frame, an invalid/expired token, or a suspended account
closes the socket with a 4401/4403 policy code. After authentication the
server only pushes events; inbound frames are ignored.
"""

from __future__ import annotations

import asyncio
import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.db.session import SessionLocal
from app.identity.models import User, UserStatus
from app.identity.security import TokenError, decode_access_token
from app.ws.manager import manager

logger = logging.getLogger("app.ws")

router = APIRouter(tags=["websocket"])

_AUTH_TIMEOUT_SECONDS = 10


@router.websocket("/ws/notifications")
async def notification_socket(websocket: WebSocket) -> None:
    """Authenticate by first-message JWT handshake, then stream events."""

    # Accept the TCP/WS upgrade first so we can close with policy codes.
    await websocket.accept()
    try:
        raw = await asyncio.wait_for(
            websocket.receive_text(), timeout=_AUTH_TIMEOUT_SECONDS
        )
    except asyncio.TimeoutError:
        await websocket.close(code=4401, reason="Authentication timed out.")
        return
    except WebSocketDisconnect:
        return
    except Exception:  # pragma: no cover - malformed frames
        await websocket.close(code=4401, reason="Invalid authentication.")
        return

    token = ""
    try:
        frame = json.loads(raw)
        if isinstance(frame, dict) and frame.get("type") == "auth":
            token = str(frame.get("token") or "")
    except (ValueError, TypeError):
        token = ""

    try:
        user_id = decode_access_token(token)
    except TokenError:
        await websocket.close(code=4401, reason="Invalid token.")
        return

    db = SessionLocal()
    try:
        user = db.get(User, user_id)
        if user is None or user.status in (UserStatus.SUSPENDED, UserStatus.DELETED):
            await websocket.close(code=4403, reason="Account not allowed.")
            return
        await manager.connect(user.id, websocket)
        try:
            while True:
                # Keep-alive receives; ignore inbound payloads. In-app push
                # is server-initiated only, so no client protocol is needed.
                await websocket.receive_text()
        except WebSocketDisconnect:
            pass
        finally:
            await manager.disconnect(user.id, websocket)
    finally:
        db.close()
