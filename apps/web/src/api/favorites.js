/** Favorites endpoints. Each helper takes the bound authed fetcher (no client duplication). */

export function listFavorites(authFetch) {
  return authFetch("/catalog/favorites");
}

export function addFavorite(authFetch, listingId) {
  return authFetch(`/catalog/listings/${listingId}/favorite`, { method: "POST" });
}

export function removeFavorite(authFetch, listingId) {
  return authFetch(`/catalog/listings/${listingId}/favorite`, { method: "DELETE" });
}
