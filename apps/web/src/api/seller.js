/** Seller workflow endpoints. Each helper takes the bound authed fetcher. */

export function createListing(authFetch, body) {
  return authFetch("/catalog/listings", { method: "POST", body });
}

export function updateListing(authFetch, listingId, body) {
  return authFetch(`/catalog/listings/${listingId}`, { method: "PATCH", body });
}

export function submitListing(authFetch, listingId) {
  return authFetch(`/catalog/listings/${listingId}/submit`, { method: "POST" });
}

export function myListings(authFetch, { status, sale_type, limit = 20, offset = 0 } = {}) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (sale_type) params.set("sale_type", sale_type);
  params.set("limit", limit);
  params.set("offset", offset);
  return authFetch(`/catalog/listings/mine?${params}`);
}

/** V1 image API registers metadata references only — no file bytes transit. */
export function listImageRefs(authFetch, listingId) {
  return authFetch(`/catalog/listings/${listingId}/images`);
}

export function addImageRef(authFetch, listingId, body) {
  return authFetch(`/catalog/listings/${listingId}/images`, { method: "POST", body });
}

export function updateImageRef(authFetch, listingId, imageId, body) {
  return authFetch(`/catalog/listings/${listingId}/images/${imageId}`, {
    method: "PATCH",
    body,
  });
}

export function deleteImageRef(authFetch, listingId, imageId) {
  return authFetch(`/catalog/listings/${listingId}/images/${imageId}`, { method: "DELETE" });
}

/** Seller creates the DRAFT auction row for their own AUCTION listing. */
export function createAuction(authFetch, body) {
  return authFetch("/auctions", { method: "POST", body });
}
