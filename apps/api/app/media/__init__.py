"""Cloud-agnostic listing-image storage abstraction (Phase 2).

The listing domain stores only an opaque ``storage_key`` (see
``app.catalog.models.ListingImage``); byte persistence and URL resolution
belong here. The current environment ships a single
:class:`LocalStorageBackend` (local disk under the configured
``MEDIA_DIR``). A future S3/GCS/Azure backend implements the same three
methods — no listing/image domain logic changes.

No cloud SDKs are imported here by design.
"""

from __future__ import annotations

from app.media.local import LocalStorageBackend, get_backend

__all__ = ["LocalStorageBackend", "get_backend"]
