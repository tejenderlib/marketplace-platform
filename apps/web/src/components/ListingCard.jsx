export default function ListingCard({ listing, isFavorite, onToggleFavorite }) {
  function handleFavorite(e) {
    e.preventDefault();
    e.stopPropagation();
    onToggleFavorite(listing.id);
  }

  return (
    <article className="listing-card">
      <a className="listing-link" href={`#/listing/${listing.id}`} aria-label={listing.title}>
        <div className="listing-media">
          <div className="listing-art" aria-hidden="true">
            <span>{listing.title.charAt(0).toUpperCase()}</span>
          </div>
          <span className={listing.isAuction ? "badge badge-auction" : "badge badge-fixed"}>
            {listing.isAuction ? "Auction" : "Fixed price"}
          </span>
          <button
            type="button"
            className={isFavorite ? "fav-btn is-active" : "fav-btn"}
            onClick={handleFavorite}
            aria-pressed={isFavorite}
            aria-label={isFavorite ? `Remove ${listing.title} from favorites` : `Save ${listing.title} to favorites`}
            title={isFavorite ? "Saved (on this device)" : "Save"}
          >
            ♥
          </button>
        </div>
        <div className="listing-body">
          <p className="listing-price">
            {listing.priceLabel}
            {listing.priceNote && <span className="price-note"> · {listing.priceNote}</span>}
          </p>
          <h3 className="listing-title">{listing.title}</h3>
          <p className="listing-meta">
            <span>{listing.location}</span>
            {listing.imageCount > 0 && (
              <span className="listing-ends">{listing.imageCount} photo{listing.imageCount === 1 ? "" : "s"}</span>
            )}
          </p>
        </div>
      </a>
    </article>
  );
}
