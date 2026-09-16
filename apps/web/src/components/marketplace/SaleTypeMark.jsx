/**
 * SaleTypeMark: single quiet sale-type signal. Auction liveness comes from
 * the real auction object only (ends_at); otherwise neutral wording.
 */

import Pill from "../ui/Pill.jsx";

export default function SaleTypeMark({ listing }) {
  if (!listing.isAuction) {
    return <span className="ce-micro ce-muted">Fixed price</span>;
  }
  const endsAt = listing.auction?.ends_at ?? null;
  const ms = endsAt ? new Date(endsAt).getTime() - Date.now() : NaN;
  if (!endsAt || !Number.isFinite(ms) || ms <= 0) {
    return <Pill status="AUCTION">Auction</Pill>;
  }
  if (ms <= 2 * 60 * 60 * 1000) {
    return <Pill status="ENDING">Ending soon</Pill>;
  }
  if (ms <= 24 * 60 * 60 * 1000) {
    return <Pill status="LIVE">Live</Pill>;
  }
  return <Pill status="AUCTION">Auction</Pill>;
}
