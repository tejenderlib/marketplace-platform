import ListingCard from "./ListingCard.jsx";
import ListingSkeleton from "./ListingSkeleton.jsx";

const SALE_TYPES = [
  ["", "All types"],
  ["FIXED_PRICE", "Fixed price"],
];

/**
 * Marketplace discovery section: toolbar (result count + search/category
 * context + the backend-supported sale-type filter), card grid, and
 * pagination. Only q / category_id / sale_type filtering exists in the
 * API, so no sort control or extra filter panel is rendered — anything
 * else would be a fake frontend-only filter.
 */
export default function ListingGrid({
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
      className="section"
      id="listings"
      aria-labelledby="listings-heading"
      aria-busy={loading}
    >
      <div className="section-head">
        <h2 id="listings-heading">Fresh listings</h2>
        <p className="section-sub" role="status">
          {total} {total === 1 ? "ad" : "ads"}
        </p>
      </div>

      <div className="discovery-toolbar">
        <div
          className="discovery-context"
          aria-label="Active search and category"
        >
          {query ? (
            <span className="context-pill">
              “<strong>{query}</strong>”
              <button
                type="button"
                onClick={onClearSearch}
                aria-label="Clear search"
              >
                ✕
              </button>
            </span>
          ) : null}
          {hasCategory ? (
            <span className="context-pill">
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
            <span className="muted">Showing everything</span>
          ) : null}
        </div>
        <div className="sale-filter discovery-sale" role="group" aria-label="Sale type filter">
          {SALE_TYPES.map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={saleType === value ? "chip is-active" : "chip"}
              aria-pressed={saleType === value}
              onClick={() => onSelectSaleType(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {showSkeletons && (
        <div className="listing-grid" aria-label="Loading listings">
          {Array.from({ length: 8 }, (_, index) => (
            <ListingSkeleton key={index} />
          ))}
        </div>
      )}
      {error && !showSkeletons && (
        <div className="empty-state" role="alert">
          <p>{error.message ?? error}</p>
          <button type="button" className="btn btn-primary" onClick={onRetry}>
            Retry
          </button>
        </div>
      )}
      {!loading && !error && items.length === 0 && (
        <div className="empty-state">
          <p>No listings match your search.</p>
          <button type="button" className="btn btn-primary" onClick={onClearFilters}>
            Clear filters
          </button>
        </div>
      )}
      {!showSkeletons && !error && items.length > 0 && (
        <>
          <div className="listing-grid">
            {items.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                isFavorite={favorites.has(listing.id)}
                onToggleFavorite={onToggleFavorite}
              />
            ))}
          </div>
          <div className="pagination storefront-pagination">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={page <= 1}
              onClick={() => onPage(page - 1)}
              aria-label="Previous page"
            >
              ← Prev
            </button>
            <span className="pagination-status" aria-live="polite">
              Page {page} of {pages}
            </span>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={page >= pages}
              onClick={() => onPage(page + 1)}
              aria-label="Next page"
            >
              Next →
            </button>
          </div>
        </>
      )}
    </section>
  );
}
