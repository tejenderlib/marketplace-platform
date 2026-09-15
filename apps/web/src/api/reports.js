/** Reports endpoints (bound authed fetcher). */

export function createReport(authFetch, payload) {
  return authFetch("/reports", { method: "POST", body: payload });
}

export function myReports(authFetch, { limit = 20, offset = 0 } = {}) {
  const params = new URLSearchParams();
  params.set("limit", limit);
  params.set("offset", offset);
  return authFetch(`/reports/me?${params}`);
}