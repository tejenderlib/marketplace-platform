/**
 * ListingGallery: large media composition. Photo count from the real
 * imageCount only; storage_key references have no servable bytes in V1.
 */

import FavoriteButton from "./FavoriteButton.jsx";
import ProductMedia from "./ProductMedia.jsx";
import SaleTypeMark from "./SaleTypeMark.jsx";

export default function ListingGallery({ listing, isFavorite, onToggleFavorite, authed }) {
  return (
    <div className="ce-gallery">
      <div className="ce-gallery-main">
        <ProductMedia listing={listing} size="lg" authed={authed} />
        <span className="ce-gallery-mark">
          <SaleTypeMark listing={listing} />
        </span>
        <span className="ce-gallery-fav">
          <FavoriteButton
            listing={listing}
            isFavorite={isFavorite}
            onToggleFavorite={onToggleFavorite}
          />
        </span>
      </div>
      <p className="ce-small ce-muted">
        {listing.imageCount === 0
          ? "No photos provided by the seller."
          : `${listing.imageCount} photo${listing.imageCount === 1 ? "" : "s"} on file.`}
      </p>
    </div>
  );
}
