/**
 * SellerTrustModule: seller identity beside the transaction. Same actions
 * as the legacy seller-card (profile, message, report); styling only.
 */

import Button from "../ui/Button.jsx";

export default function SellerTrustModule({
  listing,
  isOwnListing,
  onMessage,
  onReport,
  onPlaceholder,
}) {
  const initial = (listing.sellerName?.charAt(0) ?? "?").toUpperCase();
  const firstName = listing.sellerName?.split(" ")[0] || "Seller";
  return (
    <div className="ce-card ce-card--soft ce-seller">
      <div className="ce-seller-top">
        {listing.sellerId ? (
          <a className="ce-avatar ce-avatar--lg" href={`#/seller/${listing.sellerId}`} aria-label={`${listing.sellerName} profile`}>
            {initial}
          </a>
        ) : (
          <span className="ce-avatar ce-avatar--lg" aria-hidden="true">
            {initial}
          </span>
        )}
        <div>
          {listing.sellerId ? (
            <p className="ce-seller-name ce-seller-name--lg">
              <a href={`#/seller/${listing.sellerId}`}>{listing.sellerName}</a>
            </p>
          ) : (
            <p className="ce-seller-name ce-seller-name--lg">{listing.sellerName}</p>
          )}
          <p className="ce-small ce-muted">{listing.location || "—"}</p>
        </div>
      </div>
      {listing.sellerId ? (
        <Button variant="ghost" block href={`#/seller/${listing.sellerId}`}>
          View Profile
        </Button>
      ) : (
        <Button variant="ghost" block onClick={() => onPlaceholder("Seller profiles")}>
          View Profile
        </Button>
      )}
      {listing.sellerId && !isOwnListing ? (
        <>
          <Button variant="ghost" block onClick={onMessage}>
            Message {firstName}
          </Button>
          <Button variant="ghost" block onClick={onReport}>
            Report this listing
          </Button>
        </>
      ) : null}
    </div>
  );
}
