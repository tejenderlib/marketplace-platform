import { parseTicketContext } from "./supportContext.js";

/**
 * Small context chip for ticket rows + detail header, rendered only when
 * the ticket carries our frontend context header. Otherwise null.
 */
export default function TicketContextChip({ ticket }) {
  const context = parseTicketContext(ticket);
  if (!context) return null;
  return (
    <span className="ticket-context" title={context.header}>
      <span className="pill">{context.kind}</span>
      {context.rest && <span className="muted small">{context.rest}</span>}
    </span>
  );
}
