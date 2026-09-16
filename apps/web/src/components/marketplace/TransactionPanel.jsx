/**
 * TransactionPanel: sticky purchase aside. Exactly one primary CTA:
 * fixed → Buy Now; auction → Place a Bid (scrolls to the bid panel).
 * Same routes + guards as the legacy buy-box; styling only.
 */

import Button from "../ui/Button.jsx";
import Countdown from "../ui/Countdown.jsx";
import Pill from "../ui/Pill.jsx";
import ProductPrice from "./ProductPrice.jsx";
import { formatDateTime } from "./format.js";

export default function TransactionPanel({
  listing,
  auctionStatus,
  isOwnListing,
  isFavorite,
  onToggleFavorite,
  onBuy,
  onOffer,
  onScrollBids,
  offerDone,
}) {
  return (
    <div className="ce-card ce-txn">
      <p className="ce-txn-status">
        {listing.isAuction ? (
          <Pill status={auctionStatus ?? "LIVE"}>
            {auctionStatus === "LIVE" ? "Live auction" : (auctionStatus ?? "Auction")}
          </Pill>
        ) : (
          <Pill status={listing.status} />
        )}
      </p>
      <ProductPrice listing={listing} size="lg" />
      {listing.isAuction && listing.auction?.ends_at ? (
        <p className="ce-small ce-muted">
          <Countdown endsAt={listing.auction.ends_at} /> · Ends {formatDateTime(listing.auction.ends_at)}
        </p>
      ) : null}
      {!listing.isAuction ? (
        <Button variant="primary" block onClick={onBuy}>
          Buy Now
        </Button>
      ) : (
        <Button variant="primary" block onClick={onScrollBids}>
          Place a Bid
        </Button>
      )}
      {!listing.isAuction && !isOwnListing ? (
        <Button variant="ghost" block onClick={onOffer}>
          Make an Offer
        </Button>
      ) : null}
      <Button
        variant="ghost"
        block
        onClick={() => onToggleFavorite(listing.id)}
        aria-pressed={isFavorite}
      >
        {isFavorite ? "♥ Saved" : "♡ Save to Favorites"}
      </Button>
      {offerDone ? (
        <p className="ce-ok" role="status">
          {offerDone} <a href="#/offers">View My Offers</a>
        </p>
      ) : null}
    </div>
  );
}
