import { useCallback, useEffect, useMemo, useState } from "react";

import { ApiError } from "../api/client.js";
import { normalizeListing } from "../api/catalog.js";
import { removeFavorite } from "../api/favorites.js";
import { useAuth } from "../auth/AuthContext.jsx";
import ListingCard from "../components/marketplace/ListingCard.jsx";
import Button from "../components/ui/Button.jsx";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/States.jsx";

/**
 * Saved Items for the authenticated user. Data comes from
 * GET /catalog/favorites (strictly owner-scoped server-side); cards
 * reuse the marketplace ListingCard (real images with the existing
 * authed fallback, title, category, price, sale type, status).
 * Removing reuses DELETE .../favorite; detail opens #/listing/{id}.
 */
export default function MySavedItemsPage({ favorites, onToggleFavorite }) {
  const { authFetch } = useAuth();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("newest");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await authFetch("/catalog/favorites");
      setItems(
        (rows ?? []).map((fav) => ({
          favId: fav.listing_id,
          savedAt: fav.created_at,
          listing: normalizeListing(fav.listing),
        })),
      );
    } catch (err) {
      setError(err instanceof ApiError ? `Could not load saved items (${err.status}).` : "Network error.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleToggle(listingId) {
    await onToggleFavorite(listingId);
    load();
  }

  async function handleRemove(listingId) {
    try {
      await removeFavorite(authFetch, listingId);
      load();
    } catch {
      load();
    }
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = q
      ? items.filter(
          (row) =>
            (row.listing.title ?? "").toLowerCase().includes(q) ||
            (row.listing.categoryName ?? "").toLowerCase().includes(q),
        )
      : [...items];
    const priceOf = (row) => row.listing.raw?.fixed_price_minor ?? Number.POSITIVE_INFINITY;
    switch (sort) {
      case "oldest":
        rows.sort((a, b) => new Date(a.savedAt) - new Date(b.savedAt));
        break;
      case "price-desc":
        rows.sort((a, b) => priceOf(b) - priceOf(a));
        break;
      case "price-asc":
        rows.sort((a, b) => priceOf(a) - priceOf(b));
        break;
      default:
        rows.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
    }
    return rows;
  }, [items, query, sort]);

  return (
    <div className="ce-stack">
      <div className="myacct-toolbar">
        <div className="myacct-toolbar-row">
          <input
            type="search"
            className="ce-input myacct-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search saved items..."
            aria-label="Search saved items"
          />
          <label className="myacct-sort">
            <span>Sort:</span>
            <select value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="newest">Newest Saved</option>
              <option value="oldest">Oldest Saved</option>
              <option value="price-desc">Price High-Low</option>
              <option value="price-asc">Price Low-High</option>
            </select>
          </label>
        </div>
      </div>

      {loading && <LoadingState label="Loading saved items…" />}
      {error && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && visible.length === 0 && (
        <EmptyState
          title="Saved items is empty"
          hint="Save products you like and they'll appear here."
          action={
            <Button variant="primary" size="sm" href="#/buy">
              Explore Marketplace
            </Button>
          }
        />
      )}
      {!loading && !error && visible.length > 0 && (
        <ul className="myacct-saved-grid">
          {visible.map((row) => (
            <li key={row.favId} className="myacct-saved-cell">
              <ListingCard
                listing={row.listing}
                isFavorite={favorites.has(row.favId)}
                onToggleFavorite={() => handleToggle(row.favId)}
                authed
              />
              <Button variant="ghost" size="sm" onClick={() => handleRemove(row.favId)}>
                Remove from Saved
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
