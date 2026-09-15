import { useState } from "react";

import { formatPrice } from "../data/listings.js";
import { createOffer } from "../api/offers.js";
import AuctionPanel from "./AuctionPanel.jsx";
import ListingCard from "./ListingCard.jsx";
import OfferModal from "./OfferModal.jsx";
import ReportModal from "./ReportModal.jsx";

function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function statusPillClass(status) {
  switch (status) {
    case "ACTIVE":
      return "pill pill-active";
    case "SOLD":
      return "pill pill-sold";
    case "LIVE":
      return "pill pill-live";
    case "CANCELLED":
      return "pill pill-cancelled";
    case "PENDING":
      return "pill pill-pending";
    default:
      return "pill";
  }
}

function scrollToBids() {
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document
    .getElementById("bid-panel")
    ?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
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
  const [reportOpen, setReportOpen] = useState(false);
  const isOwnListing =
    isAuthenticated && currentUserId != null && currentUserId === listing.sellerId;

  function handleBuy() {
    if (isAuthenticated) {
      window.location.hash = `#/checkout/fixed/${listing.id}`;
    } else {
      onRequireLogin();
    }
  }

  function handleOffer() {
    if (!isAuthenticated) {
      onRequireLogin();
    } else {
      setOfferDone(null);
      setOfferOpen(true);
    }
  }

  function messageSeller() {
    if (!isAuthenticated) {
      onRequireLogin();
      return;
    }
    if (!listing.sellerId) {
      onPlaceholder("Messaging");
      return;
    }
    window.location.hash = `#/messages?listing=${listing.id}&recipient=${listing.sellerId}`;
  }

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

  const auctionStatus = listing.auction?.status ?? null;

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
              <span
                className={`listing-pill ${listing.isAuction ? "pill pill-auction" : "pill"}`}
              >
                {listing.isAuction ? "Auction" : "Fixed price"}
              </span>
              <button
                type="button"
                className={isFavorite ? "fav-btn is-active" : "fav-btn"}
                onClick={() => onToggleFavorite(listing.id)}
                aria-pressed={isFavorite}
                aria-label={isFavorite ? "Remove from favorites" : "Save to favorites"}
                title={isFavorite ? "Saved" : "Save"}
              >
                <span aria-hidden="true">♥</span>
              </button>
            </div>
            <p className="muted small">
              {listing.imageCount === 0
                ? "No photos provided by the seller."
                : `${listing.imageCount} photo${listing.imageCount === 1 ? "" : "s"} on file.`}
            </p>
          </div>

          <h1 className="detail-title">{listing.title}</h1>
          <p className="detail-price">
            {listing.priceLabel}
            {listing.priceNote && <span className="price-note"> · {listing.priceNote}</span>}
          </p>

          <dl className="detail-facts">
            <div>
              <dt>Status</dt>
              <dd><span className={statusPillClass(listing.status)}>{listing.status}</span></dd>
            </div>
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

          {listing.isAuction && (
            <AuctionPanel
              listingId={listing.id}
              isAuthenticated={isAuthenticated}
              currentUserId={currentUserId}
              authFetch={authFetch}
              onRequireLogin={onRequireLogin}
            />
          )}
        </div>

        <div className="buy-box">
          <p className="buy-status">
            {listing.isAuction ? (
              <span className={statusPillClass(auctionStatus ?? "LIVE")}>
                {auctionStatus === "LIVE" ? "Live auction" : (auctionStatus ?? "Auction")}
              </span>
            ) : (
              <span className={statusPillClass(listing.status)}>{listing.status}</span>
            )}
          </p>
          <p className="buy-price">
            {listing.priceLabel}
            {listing.priceNote && <span className="price-note"> · {listing.priceNote}</span>}
          </p>
          {listing.isAuction && listing.auction?.ends_at && (
            <p className="buy-ends">Ends {formatDateTime(listing.auction.ends_at)}</p>
          )}
          {!listing.isAuction && (
            <>
              <button type="button" className="btn btn-bid" onClick={handleBuy}>
                Buy Now
              </button>
              {!isOwnListing && (
                <button
                  type="button"
                  className="btn btn-ghost btn-block"
                  onClick={handleOffer}
                >
                  Make an Offer
                </button>
              )}
            </>
          )}
          {listing.isAuction && (
            <button type="button" className="btn btn-bid" onClick={scrollToBids}>
              Place a Bid
            </button>
          )}
          <button
            type="button"
            className={isFavorite ? "btn btn-ghost btn-block is-saved" : "btn btn-ghost btn-block"}
            onClick={() => onToggleFavorite(listing.id)}
            aria-pressed={isFavorite}
          >
            {isFavorite ? "♥ Saved" : "♡ Save to Favorites"}
          </button>
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
        </div>

        <aside className="detail-side">
          <div className="seller-card">
            <div className="seller-top">
              {listing.sellerId ? (
                <a className="seller-avatar" href={`#/seller/${listing.sellerId}`} aria-label={`${listing.sellerName} profile`}>
                  {listing.sellerName.charAt(0).toUpperCase()}
                </a>
              ) : (
                <span className="seller-avatar" aria-hidden="true">
                  {listing.sellerName.charAt(0).toUpperCase()}
                </span>
              )}
              <div>
                {listing.sellerId ? (
                  <p className="seller-name"><a href={`#/seller/${listing.sellerId}`}>{listing.sellerName}</a></p>
                ) : (
                  <p className="seller-name">{listing.sellerName}</p>
                )}
                <p className="seller-info">{listing.location}</p>
              </div>
            </div>
            {listing.sellerId ? (
              <a className="btn btn-ghost btn-block" href={`#/seller/${listing.sellerId}`}>
                View Profile
              </a>
            ) : (
              <button
                type="button"
                className="btn btn-ghost btn-block"
                onClick={() => onPlaceholder("Seller profiles")}
              >
                View Profile
              </button>
            )}
            {listing.sellerId && !isOwnListing && (
              <>
                <button type="button" className="btn btn-ghost btn-block" onClick={messageSeller}>
                  Message {listing.sellerName.split(" ")[0] || "Seller"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-block btn-report"
                  onClick={() => setReportOpen(true)}
                >
                  Report this listing
                </button>
              </>
            )}
          </div>
          {reportOpen && (
            <ReportModal
              targetType="listing"
              targetId={listing.id}
              onClose={() => setReportOpen(false)}
            />
          )}
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

      <div className="detail-stickybar" role="group" aria-label="Listing actions">
        {!listing.isAuction ? (
          <button type="button" className="btn btn-bid" onClick={handleBuy}>
            Buy Now · {listing.priceLabel}
          </button>
        ) : (
          <button type="button" className="btn btn-bid" onClick={scrollToBids}>
            Place a Bid
          </button>
        )}
      </div>
    </div>
  );
}
