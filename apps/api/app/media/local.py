"""Local-disk image storage backend (Phase 2, cloud-agnostic default).

Keys are server-generated flat filenames (``<uuid32>.<ext>``); client
filenames are never trusted and never become paths. ``path_for``
confines every lookup to ``MEDIA_DIR`` so traversal, absolute paths, and
cross-listing deletes are impossible by construction.
"""

from __future__ import annotations

import re
import uuid
from pathlib import Path

# Server-generated keys only: hex uuid + known image extension, no
# directories, no client input. Legacy manual ``storage_key`` references
# (e.g. ``listings/abc/photo.jpg``) never match and are therefore never
# resolved to or deleted from disk.
_KEY_RE = re.compile(r"^[A-Za-z0-9_-]{1,128}\.(jpg|jpeg|png|webp|gif)$")

_EXTENSION_BY_CONTENT_TYPE = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}


class LocalStorageBackend:
    """Persist listing-image bytes as files under a configured directory."""

    def __init__(self, media_dir: Path) -> None:
        self._dir = media_dir

    def save_bytes(self, data: bytes, *, content_type: str) -> str:
        """Write validated bytes; return the opaque storage key."""

        extension = _EXTENSION_BY_CONTENT_TYPE[content_type]
        self._dir.mkdir(parents=True, exist_ok=True)
        key = f"{uuid.uuid4().hex}{extension}"
        (self._dir / key).write_bytes(data)
        return key

    def path_for(self, storage_key: str) -> Path | None:
        """Resolve a key to its file, confined to the media directory.

        Returns ``None`` for anything that is not a server-generated key
        (legacy manual references, traversal attempts, absolute paths).
        """

        if not storage_key or not _KEY_RE.fullmatch(storage_key):
            return None
        candidate = self._dir / storage_key
        try:
            if candidate.resolve().parent != self._dir.resolve():
                return None
        except OSError:
            return None
        return candidate

    def delete(self, storage_key: str) -> bool:
        """Remove the stored file. Missing files report ``False``, safely."""

        path = self.path_for(storage_key)
        if path is None:
            return False
        try:
            path.unlink()
        except FileNotFoundError:
            return False
        return True


def get_backend() -> LocalStorageBackend:
    """Default backend bound to the configured ``MEDIA_DIR``."""

    from app.core.config import get_settings

    return LocalStorageBackend(get_settings().media_dir)
