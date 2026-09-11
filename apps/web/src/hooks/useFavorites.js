import { useCallback, useEffect, useState } from "react";

import { ApiError } from "../api/client.js";
import { addFavorite, listFavorites, removeFavorite } from "../api/favorites.js";

/**
 * Server-authoritative favorites. Loads on auth change, clears on logout.
 * Never persisted locally; the backend is the source of truth.
 */
export function useFavorites({ isAuthenticated, authFetch, onAuthRequired }) {
  const [ids, setIds] = useState(() => new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    if (!isAuthenticated) {
      setIds(new Set());
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await listFavorites(authFetch);
      setIds(new Set(rows.map((fav) => fav.listing_id)));
    } catch (err) {
      setError(err instanceof ApiError ? `Could not load favorites (${err.status}).` : "Network error.");
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, authFetch]);

  useEffect(() => {
    reload();
  }, [reload]);

  const toggleFavorite = useCallback(
    async (listingId) => {
      if (!isAuthenticated) {
        onAuthRequired();
        return { ok: false, redirected: true };
      }
      const active = ids.has(listingId);
      try {
        if (active) {
          await removeFavorite(authFetch, listingId);
        } else {
          await addFavorite(authFetch, listingId);
        }
        await reload();
        return { ok: true };
      } catch (err) {
        if (err instanceof ApiError && err.status === 409 && !active) {
          // Already favorited (e.g. duplicate request): resync, not an error.
          await reload();
          return { ok: true };
        }
        if (err instanceof ApiError && err.status === 404 && active) {
          await reload();
          return { ok: true };
        }
        return { ok: false, message: err instanceof ApiError ? err.message : "Network error." };
      }
    },
    [ids, isAuthenticated, authFetch, onAuthRequired, reload],
  );

  return { ids, loading, error, reload, toggleFavorite };
}
