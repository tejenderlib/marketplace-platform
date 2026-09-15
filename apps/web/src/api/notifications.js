/** Notifications endpoints (bound authed fetcher). */

export function listNotifications(authFetch, { limit = 20, offset = 0 } = {}) {
  const params = new URLSearchParams();
  params.set("limit", limit);
  params.set("offset", offset);
  return authFetch(`/notifications?${params}`);
}

export function unreadCount(authFetch) {
  return authFetch("/notifications/unread-count");
}

export function markRead(authFetch, id) {
  return authFetch(`/notifications/${id}/read`, { method: "PATCH" });
}

export function markAllRead(authFetch) {
  return authFetch("/notifications/mark-read", { method: "POST" });
}