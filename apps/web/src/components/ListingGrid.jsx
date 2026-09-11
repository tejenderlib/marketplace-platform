import ListingCard from "./ListingCard.jsx";

export default function ListingGrid({
  items,
  total,
  loading,
  error,
  onRetry,
  favorites,
  onToggleFavorite,
  onClearFilters,
  query,
  activeCategoryName,
  page,
  pages,
  onPage,
}) {
  return (
    <section className="section" id="listings" aria-labelledby="listings-heading">
      <div className="section-head">
        <h2 id="listings-heading">Fresh listings</h2>
        <p className="section-sub">
          {total} {total === 1 ? "ad" : "ads"}
          {query && (
            <>
              {" "}
              for “<strong>{query}</strong>”
            </>
          )}
          {activeCategoryName && activeCategoryName !== "All" && <> in {activeCategoryName}</>}
        </p>
      </div>

      {loading && <p className="muted" role="status">Loading listings…</p>}
      {error && (
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
      {!error && items.length > 0 && (
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
            >
              ← Prev
            </button>
            <span>
              Page {page} of {pages}
            </span>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={page >= pages}
              onClick={() => onPage(page + 1)}
            >
              Next →
            </button>
          </div>
        </>
      )}
    </section>
  );
}
