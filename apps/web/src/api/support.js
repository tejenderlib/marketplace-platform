/** Support ticket endpoints (bound authed fetcher). */

export function listMyTickets(authFetch, { limit = 20, offset = 0 } = {}) {
  const params = new URLSearchParams();
  params.set("limit", limit);
  params.set("offset", offset);
  return authFetch(`/support/tickets?${params}`);
}

export function getTicket(authFetch, ticketId) {
  return authFetch(`/support/tickets/${encodeURIComponent(ticketId)}`);
}

export function getTicketMessages(authFetch, ticketId) {
  return authFetch(`/support/tickets/${encodeURIComponent(ticketId)}/messages`);
}

export function createTicket(authFetch, { subject, description }) {
  return authFetch("/support/tickets", { method: "POST", body: { subject, description } });
}

export function replyToTicket(authFetch, ticketId, body) {
  return authFetch(`/support/tickets/${encodeURIComponent(ticketId)}/messages`, {
    method: "POST",
    body: { body },
  });
}