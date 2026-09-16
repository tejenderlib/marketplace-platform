/**
 * Curated Exchange listing card: media-first lot composition.
 * Same props + behavior as the legacy ListingCard; valid HTML via the
 * stretched-link pattern (favorite + seller are siblings, never nested).
 */

import AuctionPreview from "./AuctionPreview.jsx";
import FavoriteButton from "./FavoriteButton.jsx";
import ProductMedia from "./ProductMedia.jsx";
import ProductPrice from "./ProductPrice.jsx";
import SaleTypeMark from "./SaleTypeMark.jsx";
import SellerTrustRow from "./SellerTrustRow.jsx";

export default function ListingCard({ listing, isFavorite, onToggleFavorite, preview }) {
  const meta = [listing.location, listing.condition].filter(Boolean).join(" · ");
  const body = (
    <>
      <span className="ce-lcard-media">
        <ProductMedia listing={listing} />
      </span>
      <span className="ce-lcard-body">
        <SaleTypeMark listing={listing} />
        <ProductPrice listing={listing} />
        <span className="ce-lcard-title">{listing.title}</span>
        {meta ? <span className="ce-lcard-meta">{meta}</span> : null}
        {listing.isAuction ? <AuctionPreview listing={listing} /> : null}
      </span>
    </>
  );
  return (
    <article className="ce-lcard">
      {preview ? (
        <div className="ce-lcard-main" role="group" aria-label={`${listing.title} (preview)`}>
          {body}
        </div>
      ) : (
        <a className="ce-lcard-main" href={`#/listing/${listing.id}`} aria-label={listing.title}>
          {body}
        </a>
      )}
      <span className="ce-lcard-fav">
        {preview ? (
          <span className="ce-fav" aria-hidden="true">
            <span aria-hidden="true">♥</span>
          </span>
        ) : (
          <FavoriteButton
            listing={listing}
            isFavorite={isFavorite}
            onToggleFavorite={onToggleFavorite}
          />
        )}
      </span>
      <span className="ce-lcard-seller">
        <SellerTrustRow listing={listing} />
      </span>
    </article>
  );
}
