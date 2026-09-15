import { formatPrice } from "../data/listings.js";

const ENDING_SOON_MS = 24 * 60 * 60 * 1000;
const URGENT_MS = 2 * 60 * 60 * 1000;

/** Relative auction end label from an ISO timestamp. Null when unusable. */
function endsInLabel(endsAt) {
  if (!endsAt) return null;
  const ms = new Date(endsAt).getTime() - Date.now();
  if (Number.isNaN(ms)) return null;
  if (ms <= 0) return "Auction ended";
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `Ends in ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    const rest = minutes % 60;
    return rest ? `Ends in ${hours}h ${rest}m` : `Ends in ${hours}h`;
  }
  const date = new Date(endsAt);
  return `Ends ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

function auctionState(listing) {
  if (!listing.isAuction) return null;
  const endsAt = listing.auction?.ends_at ?? null;
  const ms = endsAt ? new Date(endsAt).getTime() - Date.now() : NaN;
  if (!endsAt || Number.isNaN(ms) || ms <= 0) {
    return { pill: "Auction", pillClass: "pill pill-auction", urgent: false };
  }
  if (ms <= URGENT_MS) {
    return { pill: "Ending soon", pillClass: "pill pill-ending", urgent: true };
  }
  return { pill: "Live", pillClass: "pill pill-live", urgent: false };
}

export default function ListingCard({ listing, isFavorite, onToggleFavorite, interactive = true }) {
  function handleFavorite(e) {
    e.preventDefault();
    e.stopPropagation();
    onToggleFavorite(listing.id);
  }

  const auction = auctionState(listing);
  const bidMinor = listing.auction?.current_bid_minor;
  const price =
    listing.isAuction && bidMinor != null ? formatPrice(bidMinor) : listing.priceLabel;
  const priceNote =
    listing.isAuction && bidMinor != null ? "Current bid" : listing.priceNote;
  const endsLabel = listing.isAuction ? endsInLabel(listing.auction?.ends_at) : null;
  const meta = [listing.location, listing.condition].filter(Boolean).join(" · ");

  return (
    <article className="listing-card">
      <a className="listing-link" href={`#/listing/${listing.id}`} aria-label={listing.title}>
        <div className="listing-media">
          <div className="listing-art" aria-hidden="true">
            <span>{listing.title.charAt(0).toUpperCase()}</span>
          </div>
          {auction ? (
            <span className={`listing-pill ${auction.pillClass}`}>{auction.pill}</span>
          ) : (
            <span className="listing-pill pill">Fixed price</span>
          )}
          {interactive ? (
            <button
              type="button"
              className={isFavorite ? "fav-btn is-active" : "fav-btn"}
              onClick={handleFavorite}
              aria-pressed={isFavorite}
              aria-label={isFavorite ? `Remove ${listing.title} from favorites` : `Save ${listing.title} to favorites`}
              title={isFavorite ? "Saved" : "Save"}
            >
              <span aria-hidden="true">♥</span>
            </button>
          ) : (
            <span className="fav-btn" aria-hidden="true">
              <span aria-hidden="true">♥</span>
            </span>
          )}
        </div>
        <div className="listing-body">
          <p className="listing-price">
            {price}
            {priceNote && <span className="price-note"> · {priceNote}</span>}
          </p>
          <h3 className="listing-title">{listing.title}</h3>
          {meta && <p className="listing-meta">{meta}</p>}
          {endsLabel && (
            <p className={auction?.urgent ? "listing-ends is-urgent" : "listing-ends"}>
              {endsLabel}
            </p>
          )}
        </div>
      </a>
      {listing.sellerId && (
        <a className="listing-seller" href={`#/seller/${listing.sellerId}`}>
          <span className="listing-seller-avatar" aria-hidden="true">
            {listing.sellerName.charAt(0).toUpperCase()}
          </span>
          <span className="listing-seller-name">{listing.sellerName}</span>
        </a>
      )}
    </article>
  );
}
