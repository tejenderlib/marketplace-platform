/**
 * DiscoveryGrid: editorial discovery section. Same data contract as the
 * legacy ListingGrid (q / category_id / sale_type only — no fake sorts or
 * filters). Sale-type as a quiet segmented control; auction cards intermix
 * chronologically in backend order.
 */

import Button from "../ui/Button.jsx";
import { EmptyState, ErrorState } from "../ui/States.jsx";
import ListingCard from "./ListingCard.jsx";
import ListingCardSkeleton from "./ListingCardSkeleton.jsx";

const SALE_TYPES = [
  ["", "All"],
  ["FIXED_PRICE", "Fixed price"],
  ["AUCTION", "Auctions"],
];

export default function DiscoveryGrid({
  items,
  total,
  loading,
  error,
  onRetry,
  favorites,
  onToggleFavorite,
  onClearFilters,
  onClearCategory,
  onClearSearch,
  query,
  activeCategoryName,
  saleType,
  onSelectSaleType,
  page,
  pages,
  onPage,
}) {
  const hasCategory = activeCategoryName && activeCategoryName !== "All";
  const showSkeletons = loading && items.length === 0;

  return (
    <section
      className="ce-discovery"
      id="listings"
      aria-labelledby="listings-heading"
      aria-busy={loading}
    >
      <div className="ce-discovery-head">
        <div>
          <p className="ce-micro">Curated marketplace</p>
          <h2 id="listings-heading" className="ce-h2">Fresh listings</h2>
        </div>
        <p className="ce-small ce-muted ce-tnum" role="status">
          {total} {total === 1 ? "listing" : "listings"}
        </p>
      </div>

      <div className="ce-discovery-toolbar">
        <div className="ce-cluster" aria-label="Active search and category">
          {query ? (
            <span className="ce-context-pill">
              “<strong>{query}</strong>”
              <button type="button" onClick={onClearSearch} aria-label="Clear search">
                ✕
              </button>
            </span>
          ) : null}
          {hasCategory ? (
            <span className="ce-context-pill">
              in <strong>{activeCategoryName}</strong>
              <button
                type="button"
                onClick={onClearCategory}
                aria-label={`Clear category filter ${activeCategoryName}`}
              >
                ✕
              </button>
            </span>
          ) : null}
          {!query && !hasCategory ? (
            <span className="ce-small ce-muted">Showing everything</span>
          ) : null}
        </div>
        <div className="ce-segmented" role="group" aria-label="Sale type filter">
          {SALE_TYPES.map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={saleType === value ? "ce-btn ce-btn--secondary ce-btn--sm is-active" : "ce-btn ce-btn--ghost ce-btn--sm"}
              aria-pressed={saleType === value}
              onClick={() => onSelectSaleType(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {showSkeletons && (
        <div className="ce-grid" aria-label="Loading listings">
          {Array.from({ length: 8 }, (_, index) => (
            <ListingCardSkeleton key={index} />
          ))}
        </div>
      )}
      {error && !showSkeletons && (
        <ErrorState message={error.message ?? error} onRetry={onRetry} />
      )}
      {!loading && !error && items.length === 0 && (
        <EmptyState
          title="No listings match your search"
          hint="Try a different term or clear the filters."
          action={<Button variant="secondary" size="sm" onClick={onClearFilters}>Clear filters</Button>}
        />
      )}
      {!showSkeletons && !error && items.length > 0 && (
        <>
          <div className="ce-grid">
            {items.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                isFavorite={favorites.has(listing.id)}
                onToggleFavorite={onToggleFavorite}
              />
            ))}
          </div>
          <div className="ce-pagination">
            <Button
              variant="ghost"
              size="sm"
              disabled={page <= 1}
              onClick={() => onPage(page - 1)}
              aria-label="Previous page"
            >
              ← Prev
            </Button>
            <span className="ce-small ce-muted ce-tnum" aria-live="polite">
              Page {page} of {pages}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={page >= pages}
              onClick={() => onPage(page + 1)}
              aria-label="Next page"
            >
              Next →
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
