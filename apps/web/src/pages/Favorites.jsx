import { useCallback, useEffect, useState } from "react";

import { ApiError } from "../api/client.js";
import { normalizeListing } from "../api/catalog.js";
import ListingCard from "../components/marketplace/ListingCard.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import Button from "../components/ui/Button.jsx";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/States.jsx";

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
    return <p className="ce-small ce-muted">Redirecting to login…</p>;
  }

  return (
    <div className="ce-stack">
      <div>
        <p className="ce-micro ce-muted">Saved for later</p>
        <h1 className="ce-h1">My Favorites</h1>
      </div>
      {state.loading && <LoadingState label="Loading favorites…" />}
      {state.error && <ErrorState message={state.error} onRetry={load} />}
      {!state.loading && !state.error && state.items.length === 0 && (
        <EmptyState
          title="No favorites yet"
          hint="Tap ♥ on any listing to save it here."
          action={<Button variant="secondary" size="sm" href="#/">Browse listings</Button>}
        />
      )}
      {!state.error && state.items.length > 0 && (
        <div className="ce-grid">
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
