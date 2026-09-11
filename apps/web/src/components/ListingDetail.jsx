import { useState } from "react";

import { formatPrice } from "../data/listings.js";
import { createOffer } from "../api/offers.js";
import AuctionPanel from "./AuctionPanel.jsx";
import ListingCard from "./ListingCard.jsx";
import OfferModal from "./OfferModal.jsx";

function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export default function ListingDetail({
  listing,
  isFavorite,
  onToggleFavorite,
  onPlaceholder,
  isAuthenticated,
  currentUserId,
  authFetch,
  onRequireLogin,
  onOfferCreated,
  similar,
  similarFavorites,
}) {
  const [offerOpen, setOfferOpen] = useState(false);
  const [offerDone, setOfferDone] = useState(null);
  const galleryCount = Math.max(1, listing.imageCount);
  const isOwnListing =
    isAuthenticated && currentUserId != null && currentUserId === listing.sellerId;

  async function submitOffer({ amount_minor, message, expires_at }) {
    const created = await createOffer(authFetch, {
      listing_id: listing.id,
      amount_minor,
      message,
      expires_at,
    }).catch((err) => {
      throw new Error(err.message ?? "Could not place the offer.");
    });
    setOfferOpen(false);
    setOfferDone(`Offer of ${formatPrice(created.amount_minor)} sent.`);
    onOfferCreated?.(created);
  }

  return (
    <div className="content detail-page">
      <a className="back-link" href="#/">
        ← Back to listings
      </a>

      <div className="detail-layout">
        <div className="detail-main">
          <div className="gallery">
            <div className="gallery-main">
              <div className="listing-art listing-art-large" aria-hidden="true">
                <span>{listing.title.charAt(0).toUpperCase()}</span>
              </div>
              <span className={listing.isAuction ? "badge badge-auction" : "badge badge-fixed"}>
                {listing.isAuction ? "Auction" : "Fixed price"}
              </span>
              <button
                type="button"
                className={isFavorite ? "fav-btn is-active" : "fav-btn"}
                onClick={() => onToggleFavorite(listing.id)}
                aria-pressed={isFavorite}
                aria-label={isFavorite ? "Remove from favorites" : "Save to favorites"}
                title={isFavorite ? "Saved (on this device)" : "Save"}
              >
                ♥
              </button>
            </div>
            <p className="muted small">
              {listing.imageCount === 0
                ? "No photos provided by the seller."
                : `${listing.imageCount} photo${listing.imageCount === 1 ? "" : "s"} on file.`}{" "}
              ({galleryCount} view{galleryCount === 1 ? "" : "s"})
            </p>
          </div>

          <h1 className="detail-title">{listing.title}</h1>
          <p className="detail-price">
            {listing.priceLabel}
            {listing.priceNote && <span className="price-note"> · {listing.priceNote}</span>}
          </p>

          <dl className="detail-facts">
            <div>
              <dt>Location</dt>
              <dd>{listing.location || "—"}</dd>
            </div>
            <div>
              <dt>Condition</dt>
              <dd>{listing.condition}</dd>
            </div>
            <div>
              <dt>Category</dt>
              <dd>{listing.categoryName}</dd>
            </div>
            <div>
              <dt>Posted</dt>
              <dd>{formatDateTime(listing.createdAt)}</dd>
            </div>
          </dl>

          <h2>About this listing</h2>
          <p className="detail-description">{listing.description || "No description provided."}</p>

          {!listing.isAuction && (
            <div className="detail-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => (isAuthenticated ? onPlaceholder("Buy Now") : onRequireLogin())}
              >
                Buy Now
              </button>
              {!isOwnListing && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    if (!isAuthenticated) {
                      onRequireLogin();
                    } else {
                      setOfferDone(null);
                      setOfferOpen(true);
                    }
                  }}
                >
                  Make an Offer
                </button>
              )}
            </div>
          )}
          {offerDone && (
            <p className="form-ok" role="status">
              {offerDone} <a href="#/offers">View My Offers</a>
            </p>
          )}
          {offerOpen && (
            <OfferModal
              listing={listing}
              onClose={() => setOfferOpen(false)}
              onSubmit={submitOffer}
            />
          )}

          {listing.isAuction && (
            <AuctionPanel
              listingId={listing.id}
              isAuthenticated={isAuthenticated}
              authFetch={authFetch}
              onRequireLogin={onRequireLogin}
            />
          )}
        </div>

        <aside className="detail-side">
          <div className="seller-card">
            <div className="seller-top">
              <span className="seller-avatar" aria-hidden="true">
                {listing.sellerName.charAt(0).toUpperCase()}
              </span>
              <div>
                <p className="seller-name">{listing.sellerName}</p>
                <p className="seller-info">{listing.location}</p>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-block"
              onClick={() => onPlaceholder("Seller profiles")}
            >
              View Profile
            </button>
          </div>
        </aside>
      </div>

      {similar.length > 0 && (
        <section className="section" aria-labelledby="similar-heading">
          <div className="section-head">
            <h2 id="similar-heading">Similar listings</h2>
          </div>
          <div className="listing-grid">
            {similar.map((item) => (
              <ListingCard
                key={item.id}
                listing={item}
                isFavorite={similarFavorites.has(item.id)}
                onToggleFavorite={onToggleFavorite}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
