/** Offers endpoints. Each helper takes the bound authed fetcher (no client duplication). */

export function createOffer(authFetch, { listing_id, amount_minor, message, expires_at }) {
  // INR is the only supported currency; the backend requires it explicitly.
  const body = { listing_id, amount_minor, currency: "INR", message: message ?? null, expires_at: expires_at ?? null };
  return authFetch("/offers", { method: "POST", body });
}

export function myOffers(authFetch, { status, listing_id, limit = 20, offset = 0 } = {}) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (listing_id) params.set("listing_id", listing_id);
  params.set("limit", limit);
  params.set("offset", offset);
  return authFetch(`/offers/me?${params}`);
}

export function getOffer(authFetch, offerId) {
  return authFetch(`/offers/${offerId}`);
}

export function respondOffer(authFetch, offerId, status) {
  return authFetch(`/offers/${offerId}`, { method: "PATCH", body: { status } });
}

export function withdrawOffer(authFetch, offerId) {
  return authFetch(`/offers/${offerId}/withdraw`, { method: "POST" });
}

export function sellerOffers(authFetch, { status, listing_id, limit = 20, offset = 0 } = {}) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (listing_id) params.set("listing_id", listing_id);
  params.set("limit", limit);
  params.set("offset", offset);
  return authFetch(`/seller/offers?${params}`);
}
