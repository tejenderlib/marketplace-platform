/**
 * ListingDetailView: Curated Exchange product page. Same data + handlers
 * as the legacy ListingDetail (buy/offer/message/report/favorite, offer +
 * report modals, AuctionPanel, similar) recomposed into the 7:5
 * gallery-to-transaction grid with a mobile sticky action bar.
 */

import { useState } from "react";

import { formatPrice } from "../../data/listings.js";
import { createOffer } from "../../api/offers.js";
import AuctionPanel from "../AuctionPanel.jsx";
import OfferModal from "../OfferModal.jsx";
import ReportModal from "../ReportModal.jsx";
import Button from "../ui/Button.jsx";
import Pill from "../ui/Pill.jsx";
import FulfillmentList from "./FulfillmentList.jsx";
import ListingCard from "./ListingCard.jsx";
import ListingGallery from "./ListingGallery.jsx";
import ProductPrice from "./ProductPrice.jsx";
import TransactionPanel from "./TransactionPanel.jsx";
import SellerTrustModule from "./SellerTrustModule.jsx";

function scrollToBids() {
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document
    .getElementById("bid-panel")
    ?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
}

export default function ListingDetailView({
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
  const eyebrow = [listing.categoryName, listing.condition, listing.location]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="ce-scope">
      <div className="ce-container ce-detail">
        <a className="ce-back" href="#/">
          ← Back to listings
        </a>

        <div className="ce-detail-grid">
          <div className="ce-detail-gallery">
            <ListingGallery
              listing={listing}
              isFavorite={isFavorite}
              onToggleFavorite={onToggleFavorite}
            />
          </div>

          <div className="ce-detail-title">
            {eyebrow ? <p className="ce-micro ce-muted">{eyebrow}</p> : null}
            <h1 className="ce-h1">{listing.title}</h1>
            <div className="ce-cluster">
              <Pill status={listing.status} />
              <ProductPrice listing={listing} />
            </div>
          </div>

          <aside className="ce-detail-aside" aria-label="Purchase">
            <TransactionPanel
              listing={listing}
              auctionStatus={auctionStatus}
              isOwnListing={isOwnListing}
              isFavorite={isFavorite}
              onToggleFavorite={onToggleFavorite}
              onBuy={handleBuy}
              onOffer={handleOffer}
              onScrollBids={scrollToBids}
              offerDone={offerDone}
            />
            <SellerTrustModule
              listing={listing}
              isOwnListing={isOwnListing}
              onMessage={messageSeller}
              onReport={() => setReportOpen(true)}
              onPlaceholder={onPlaceholder}
            />
          </aside>

          <div className="ce-detail-main">
            <FulfillmentList listing={listing} />

            <h2 className="ce-h2">About this listing</h2>
            <p className="ce-body">{listing.description || "No description provided."}</p>

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
        </div>

        {similar.length > 0 && (
          <section className="ce-section" aria-labelledby="similar-heading">
            <h2 id="similar-heading" className="ce-h2">Similar listings</h2>
            <div className="ce-grid">
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

        <div className="ce-actionbar" role="group" aria-label="Listing actions">
          <span className="ce-actionbar-price ce-tnum">{listing.priceLabel}</span>
          {!listing.isAuction ? (
            <Button variant="primary" onClick={handleBuy}>
              Buy Now
            </Button>
          ) : (
            <Button variant="primary" onClick={scrollToBids}>
              Place a Bid
            </Button>
          )}
        </div>

        {offerOpen && (
          <OfferModal
            listing={listing}
            onClose={() => setOfferOpen(false)}
            onSubmit={submitOffer}
          />
        )}
        {reportOpen && (
          <ReportModal
            targetType="listing"
            targetId={listing.id}
            onClose={() => setReportOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
