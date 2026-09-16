/**
 * AuctionSpotlight: "Ending soon" rail from REAL auction data embedded in
 * the current discovery items (ends_at + current bid). Sorted by ends_at
 * ascending, max 4. Renders nothing when no live auctions are present —
 * no invented urgency, no bid counts (not embedded in listing payloads).
 */

import Countdown from "../ui/Countdown.jsx";
import { Link } from "./links.jsx";

export default function AuctionSpotlight({ items, onViewAll }) {
  const now = Date.now();
  const live = items
    .filter((listing) => {
      if (!listing.isAuction || !listing.auction?.ends_at) return false;
      const ms = new Date(listing.auction.ends_at).getTime() - now;
      return Number.isFinite(ms) && ms > 0;
    })
    .sort(
      (a, b) =>
        new Date(a.auction.ends_at).getTime() - new Date(b.auction.ends_at).getTime(),
    )
    .slice(0, 4);

  if (live.length === 0) return null;

  return (
    <section className="ce-section ce-spotlight" aria-labelledby="spotlight-heading">
      <div className="ce-section-head">
        <div>
          <p className="ce-micro ce-muted">Live auctions</p>
          <h2 id="spotlight-heading" className="ce-h2">Ending soon</h2>
        </div>
        <button
          type="button"
          className="ce-btn ce-btn--ghost ce-btn--sm"
          onClick={onViewAll}
        >
          View all auctions →
        </button>
      </div>
      <ol className="ce-spotlight-list">
        {live.map((listing) => (
          <li key={listing.id}>
            <Link className="ce-spotlight-row" href={`#/listing/${listing.id}`} label={listing.title}>
              <span className="ce-spotlight-title">{listing.title}</span>
              <span className="ce-spotlight-bid ce-tnum">{listing.priceLabel}</span>
              <span className="ce-small">
                <Countdown endsAt={listing.auction.ends_at} />
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
