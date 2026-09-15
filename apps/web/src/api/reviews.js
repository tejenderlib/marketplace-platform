/** Ratings & reviews helpers (bound authed fetcher). */

export function createReview(authFetch, payload) {
  return authFetch("/reviews", { method: "POST", body: payload });
}

export function myReviews(authFetch, { limit = 20, offset = 0 } = {}) {
  const params = new URLSearchParams();
  params.set("limit", limit);
  params.set("offset", offset);
  return authFetch(`/reviews/my?${params}`);
}

export function revieweeReviews(authFetch, userId, { limit = 20, offset = 0 } = {}) {
  const params = new URLSearchParams();
  params.set("limit", limit);
  params.set("offset", offset);
  return authFetch(`/reviews/reviewee/${encodeURIComponent(userId)}?${params}`);
}

/** Fetch every review page I wrote (used to detect already-reviewed orders). */
export async function allMyReviews(authFetch, pageSize = 100) {
  const items = [];
  let offset = 0;
  for (;;) {
    const page = await myReviews(authFetch, { limit: pageSize, offset });
    items.push(...page.items);
    if (items.length >= page.total) break;
    offset += page.items.length;
  }
  return { items, total: items.length };
}