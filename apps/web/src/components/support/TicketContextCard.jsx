import { parseTicketContext } from "./supportContext.js";

/**
 * Context card for the ticket detail header, rendered only when the
 * ticket carries our frontend context header (see supportContext.js).
 * All values come from the ticket's own subject/description text.
 */
export default function TicketContextCard({ ticket }) {
  const context = parseTicketContext(ticket);
  if (!context) return null;
  return (
    <div className="ticket-context-card" aria-label="Related item">
      <span className="pill">{context.kind}</span>
      {context.rest && <strong>{context.rest}</strong>}
    </div>
  );
}
