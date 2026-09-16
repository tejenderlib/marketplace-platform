/**
 * SellerTrustRow: seller identity only — avatar initial, name link,
 * location. No invented ratings, claims, or badges.
 */

export default function SellerTrustRow({ listing }) {
  const initial = (listing.sellerName?.charAt(0) ?? "?").toUpperCase();
  return (
    <div className="ce-seller-row">
      <span className="ce-avatar" aria-hidden="true">
        {initial}
      </span>
      {listing.sellerId ? (
        <a className="ce-seller-name" href={`#/seller/${listing.sellerId}`}>
          {listing.sellerName}
        </a>
      ) : (
        <span className="ce-seller-name">{listing.sellerName}</span>
      )}
    </div>
  );
}
