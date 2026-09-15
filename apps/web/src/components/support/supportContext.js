/**
 * Frontend-only ticket context convention.
 *
 * The support API stores subject + description text only (no object
 * references), so contextual tickets embed a machine-readable header as
 * the first line of the description, e.g.:
 *   [Order #abc123 · ₹42,000 · PAID]
 * and a short `[Order #abc123]` subject. parseTicketContext() reads that
 * convention back for list chips and the detail context card. Tickets
 * created before this convention (or without a header) simply show no
 * context — nothing is invented.
 */

const HEADER_RE = /^\[([^\]\n]+)\]/;

export function shortRef(id) {
  return `#${String(id ?? "").slice(0, 8)}`;
}

export function parseTicketContext(ticket) {
  for (const text of [ticket?.description, ticket?.subject]) {
    if (!text) continue;
    const match = String(text).match(HEADER_RE);
    if (match) {
      const header = match[1].trim();
      const kind = header.split(/\s+/)[0] || "Context";
      const rest = header.slice(kind.length).trim();
      return { kind, rest, header };
    }
  }
  return null;
}

export function stripContextHeader(description) {
  const text = String(description ?? "");
  return text.replace(HEADER_RE, "").replace(/^\n+/, "");
}
