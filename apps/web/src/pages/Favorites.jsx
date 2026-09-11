import { useCallback, useEffect, useState } from "react";

import { ApiError } from "../api/client.js";
import { normalizeListing } from "../api/catalog.js";
import ListingCard from "../components/ListingCard.jsx";
import { useAuth } from "../auth/AuthContext.jsx";

export default function FavoritesPage({ favorites, onToggleFavorite }) {
  const { isAuthenticated, authFetch, redirectToLogin } = useAuth();
  const [state, setState] = useState({ loading: true, error: null, items: [] });

  const load = useCallback(async () => {
    setState({ loading: true, error: null, items: [] });
    try {
      const rows = await authFetch("/catalog/favorites");
      setState({ loading: false, error: null, items: rows.map((fav) => normalizeListing(fav.listing)) });
    } catch (err) {
      setState({
        loading: false,
        error: err instanceof ApiError ? `Could not load favorites (${err.status}).` : "Network error.",
        items: [],
      });
    }
  }, [authFetch]);

  useEffect(() => {
    if (!isAuthenticated) {
      redirectToLogin();
      return;
    }
    load();
  }, [isAuthenticated, load, redirectToLogin]);

  if (!isAuthenticated) {
    return (
      <div className="content">
        <p className="muted">Redirecting to login…</p>
      </div>
    );
  }

  return (
    <div className="content">
      <h1>My Favorites</h1>
      {state.loading && <p className="muted" role="status">Loading favorites…</p>}
      {state.error && (
        <div className="empty-state" role="alert">
          <p>{state.error}</p>
          <button type="button" className="btn btn-primary" onClick={load}>Retry</button>
        </div>
      )}
      {!state.loading && !state.error && state.items.length === 0 && (
        <div className="empty-state">
          <p>No favorites yet. Tap ♥ on any listing to save it here.</p>
          <a className="btn btn-primary" href="#/">Browse listings</a>
        </div>
      )}
      {!state.error && state.items.length > 0 && (
        <div className="listing-grid">
          {state.items.map((listing) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              isFavorite={favorites.has(listing.id)}
              onToggleFavorite={onToggleFavorite}
            />
          ))}
        </div>
      )}
    </div>
  );
}
