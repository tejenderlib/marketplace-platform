/**
 * AuctionPreview: calm-urgency line for cards. Countdown from the real
 * ends_at only; ended auctions state it plainly. No reserve/bid-count
 * claims (card data has no bid_count — that lives in AuctionPanel).
 */

import Countdown from "../ui/Countdown.jsx";

export default function AuctionPreview({ listing }) {
  const endsAt = listing.auction?.ends_at ?? null;
  if (!endsAt) return null;
  const ms = new Date(endsAt).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) {
    return <p className="ce-muted ce-small">Auction ended</p>;
  }
  return (
    <p className="ce-small">
      <Countdown endsAt={endsAt} />
    </p>
  );
}
