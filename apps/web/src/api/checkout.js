/** Checkout, address, order, and payment helpers (bound authed fetcher). */

export function listAddresses(authFetch) {
  return authFetch("/addresses");
}

export function createAddress(authFetch, payload) {
  return authFetch("/addresses", { method: "POST", body: payload });
}

export function updateAddress(authFetch, addressId, payload) {
  return authFetch(`/addresses/${addressId}`, { method: "PATCH", body: payload });
}

export function fixedPriceCheckout(authFetch, payload) {
  return authFetch("/checkout/fixed-price", { method: "POST", body: payload });
}

export function auctionCheckout(authFetch, payload) {
  return authFetch("/checkout/auction", { method: "POST", body: payload });
}

export function offerCheckout(authFetch, payload) {
  return authFetch("/checkout/offer", { method: "POST", body: payload });
}

export function myOrders(authFetch, { status, limit = 20, offset = 0 } = {}) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  params.set("limit", limit);
  params.set("offset", offset);
  return authFetch(`/orders/me?${params}`);
}

export function getOrder(authFetch, orderId) {
  return authFetch(`/orders/${orderId}`);
}

export function payOrder(authFetch, orderId, { idempotency_key, simulate = "success" }) {
  return authFetch(`/orders/${orderId}/payment`, {
    method: "POST",
    body: { idempotency_key, simulate },
  });
}
