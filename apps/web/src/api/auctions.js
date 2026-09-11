import { apiFetch } from "./client.js";

/** Public auction discovery (paginated). */
export function listAuctions({ status, phase, limit = 20, offset = 0 } = {}) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (phase) params.set("phase", phase);
  params.set("limit", limit);
  params.set("offset", offset);
  return apiFetch(`/auctions?${params}`);
}

/** Public auction detail. */
export function getAuction(auctionId) {
  return apiFetch(`/auctions/${auctionId}`);
}

/**
 * Find the auction for a listing. No listing_id filter exists on the API,
 * so this pages the (small) auction index and matches locally.
 */
export async function findAuctionForListing(listingId, limit = 100) {
  let offset = 0;
  for (;;) {
    const page = await listAuctions({ limit, offset });
    const found = page.items.find((a) => a.listing_id === listingId);
    if (found) return found;
    if (offset + page.items.length >= page.total) return null;
    offset += page.items.length;
  }
}

/** Public bid history (paginated). */
export function listBids(auctionId, { limit = 20, offset = 0 } = {}) {
  return apiFetch(`/auctions/${auctionId}/bids?limit=${limit}&offset=${offset}`);
}

/** Authenticated bid placement. request_id makes retries idempotent. */
export function placeBid(authFetch, auctionId, { amount_minor, request_id }) {
  return authFetch(`/auctions/${auctionId}/bids`, {
    method: "POST",
    body: { amount_minor, currency: "INR", request_id },
  });
}

/** Auction result (visibility enforced by backend; 404 when none). */
export function getAuctionResult(auctionId) {
  return apiFetch(`/auctions/${auctionId}/result`);
}
