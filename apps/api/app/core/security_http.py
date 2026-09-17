"""Phase 8 global API hardening middleware and exception handlers.

- Security headers on every response (CSP is intentionally minimal; the SPA
  is served from a separate origin and needs only frame/ReferrerPolicy
  hardening here).
- Host-header validation: outside the default (empty allowlist) mode, an
  unexpected Host yields 400 without touching the app.
- Request-body ceiling: oversized JSON bodies are rejected before handlers.
- Global exception handler: unexpected errors return a generic 500 with no
  stack trace, SQL, or configuration details; the details go to the server
  log only.
"""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import get_settings

logger = logging.getLogger("app.security")

_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Cache-Control": "no-store",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
}


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        for header, value in _SECURITY_HEADERS.items():
            response.headers.setdefault(header, value)
        return response


class HostValidationMiddleware(BaseHTTPMiddleware):
    """Reject requests with an unexpected Host header (DNS-pinning / cache-poisoning).

    With the default empty ``allowed_hosts`` the check is disabled (local
    Docker/Vite development binds many hostnames). Set ``ALLOWED_HOSTS`` in
    production to pin the real hosts; then anything else gets 400.
    """

    async def dispatch(self, request: Request, call_next):
        allowed = get_settings().allowed_hosts
        if allowed:
            host = (request.headers.get("host") or "").split(":", 1)[0].lower()
            if host not in {h.lower() for h in allowed}:
                return JSONResponse(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    content={"detail": "Invalid Host header."},
                )
        return await call_next(request)


class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    """Reject request bodies above the configured ceiling (413).

    The listing-image upload endpoint (``.../images/upload``) accepts
    real image bytes up to the image policy ceiling
    (``MAX_IMAGE_BYTES``) and enforces that bound itself, so it is
    exempted here; every other route keeps the JSON-body ceiling.
    """

    _EXEMPT_SUFFIX = "/images/upload"

    async def dispatch(self, request: Request, call_next):
        if not request.url.path.endswith(self._EXEMPT_SUFFIX):
            limit = get_settings().max_request_body_bytes
            content_length = request.headers.get("content-length")
            if content_length is not None:
                try:
                    if int(content_length) > limit:
                        return JSONResponse(
                            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                            content={"detail": "Request body is too large."},
                        )
                except ValueError:
                    return JSONResponse(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        content={"detail": "Invalid Content-Length header."},
                    )
        return await call_next(request)


def install_security(app: FastAPI) -> None:
    """Register middleware and safe exception handlers on the app."""

    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(HostValidationMiddleware)
    app.add_middleware(BodySizeLimitMiddleware)

    @app.exception_handler(RequestValidationError)
    async def on_validation_error(request: Request, exc: RequestValidationError):
        # Pydantic errors are safe to echo (they describe the client's own
        # payload), but cap the payload so a giant body cannot be reflected
        # and strip non-serializable ctx objects (e.g. raised ValueError
        # instances attached by field validators).
        errors = []
        for item in exc.errors()[:20]:
            safe = {
                key: value
                for key, value in item.items()
                if key != "ctx"
            }
            errors.append(safe)
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={"detail": "Request validation failed.", "errors": errors},
        )

    @app.exception_handler(Exception)
    async def on_unexpected_error(request: Request, exc: Exception):
        # Never leak internals: generic message to the client, full detail
        # (method, path, exception) to the server log only. No tokens,
        # passwords, or DSNs appear here.
        logger.exception(
            "Unhandled error on %s %s", request.method, request.url.path
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": "An unexpected error occurred."},
        )
