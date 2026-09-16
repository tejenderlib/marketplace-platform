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
    <div className="ce-card ce-card--pad-sm" aria-label="Related item">
      <p className="ce-cluster">
        <span className="ce-pill">{context.kind}</span>
        {context.rest && <strong>{context.rest}</strong>}
      </p>
    </div>
  );
}
