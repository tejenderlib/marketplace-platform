/** Direct messaging endpoints (bound authed fetcher). */

export function listConversations(authFetch, { limit = 20, offset = 0 } = {}) {
  const params = new URLSearchParams();
  params.set("limit", limit);
  params.set("offset", offset);
  return authFetch(`/messages/conversations?${params}`);
}

export function getConversation(authFetch, conversationId, { limit = 100, offset = 0 } = {}) {
  const params = new URLSearchParams();
  params.set("limit", limit);
  params.set("offset", offset);
  return authFetch(`/messages/conversations/${encodeURIComponent(conversationId)}?${params}`);
}

export function startConversation(authFetch, { listing_id, recipient_id, body }) {
  return authFetch("/messages/conversations", { method: "POST", body: { listing_id, recipient_id, body } });
}

export function sendMessage(authFetch, conversationId, body) {
  return authFetch(`/messages/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: "POST",
    body: { body },
  });
}