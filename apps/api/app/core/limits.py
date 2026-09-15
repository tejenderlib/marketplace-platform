"""Centralized server-side input and resource limits (Phase 8).

Single source of truth for bounds enforced at the schema/endpoint layer
so policies stay consistent across domains. Values are deliberately
generous: they exist to stop abuse and overflow, not to constrain
legitimate use.
"""

from __future__ import annotations

# Money: minor units (paise). BIGINT-safe ceiling of INR 1,00,00,000
# (one crore rupees = 1_000_000_000 paise) for any single user-supplied
# amount: listing prices, offers, bids, auction parameters.
MAX_MONEY_MINOR = 1_000_000_000

# Free-text user input ceilings (characters).
MAX_MESSAGE_BODY_CHARS = 2000
MAX_SUPPORT_SUBJECT_CHARS = 200
MAX_SUPPORT_DESCRIPTION_CHARS = 5000
MAX_REPORT_REASON_CHARS = 200
MAX_REPORT_DETAILS_CHARS = 2000

# Image metadata registration (no bytes transit the API in V1; the
# future object-store backend must re-validate actual uploads against
# the same policy).
ALLOWED_IMAGE_CONTENT_TYPES = frozenset(
    {"image/jpeg", "image/png", "image/webp", "image/gif"}
)
MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MiB
MAX_IMAGE_DIMENSION = 10000  # width/height in pixels

# Duplicate-message suppression window (seconds): an identical body from
# the same sender in the same conversation inside this window returns
# the original row instead of creating a duplicate.
DUPLICATE_MESSAGE_WINDOW_SECONDS = 15
