"""In-process background auction auto-close (Phase 8).

The smallest architecture-compatible scheduler: a single daemon thread
per API process that periodically finds LIVE auctions whose ``ends_at``
has passed and closes them through the authoritative, idempotent
``close_auction`` transaction. No Redis/queue/worker is added.

Design notes:
- Idempotent by construction: ``close_auction`` locks the auction row
  and returns the existing result on any race (double execution is a
  no-op), so overlapping runs across manual closes, endpoint traffic,
  and this loop are all safe.
- Single-instance V1: like the WebSocket manager and auth rate limiters,
  this lives in-process. Multi-instance deployments would need exactly
  one closer (leader election) or per-shard scheduling — out of scope.
- Failures never kill the loop; each cycle logs and retries later.
"""

from __future__ import annotations

import logging
import threading
from datetime import datetime, timezone

from sqlalchemy import select

from app.api.v1.auctions import close_auction
from app.db.session import SessionLocal
from app.trading.models import Auction, AuctionStatus

logger = logging.getLogger("app.auctions.scheduler")

_INTERVAL_SECONDS = 30


class AuctionCloseScheduler:
    """Daemon thread closing past-due LIVE auctions every interval."""

    def __init__(self, interval_seconds: int = _INTERVAL_SECONDS) -> None:
        self._interval = interval_seconds
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self.last_closed: int = 0

    def start(self) -> None:
        if self._thread is not None and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(
            target=self._run, name="auction-auto-close", daemon=True
        )
        self._thread.start()
        logger.info("auction auto-close scheduler started (%ss)", self._interval)

    def stop(self) -> None:
        self._stop.set()
        thread = self._thread
        if thread is not None and thread is not threading.current_thread():
            thread.join(timeout=self._interval * 2)

    def _run(self) -> None:
        # Delay the first cycle so startup (migrations, router wiring) is
        # never blocked behind a close transaction.
        self._stop.wait(self._interval)
        while not self._stop.wait(self._interval):
            try:
                self.close_due_auctions()
            except Exception:  # pragma: no cover - defensive: loop must survive
                logger.exception("auction auto-close cycle failed")

    def close_due_auctions(self) -> int:
        """Close every LIVE auction whose end time has passed. Returns count.

        Safe to call concurrently (idempotent close per auction).
        """

        now = datetime.now(timezone.utc)
        db = SessionLocal()
        try:
            due_ids = list(
                db.scalars(
                    select(Auction.id).where(
                        Auction.status == AuctionStatus.LIVE,
                        Auction.ends_at <= now,
                    )
                ).all()
            )
        finally:
            db.close()
        closed = 0
        for auction_id in due_ids:
            db = SessionLocal()
            try:
                _, _, created = close_auction(db, auction_id)
                if created:
                    closed += 1
                    logger.info("auto-closed auction %s", auction_id)
            except Exception:
                # 409-style rejections happen when a concurrent endpoint
                # closed the auction first; anything else is logged and
                # skipped so one bad auction cannot stall the cycle.
                logger.exception("auto-close failed for %s", auction_id)
            finally:
                db.close()
        self.last_closed = closed
        return closed


scheduler = AuctionCloseScheduler()
