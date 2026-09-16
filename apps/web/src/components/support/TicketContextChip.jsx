import { parseTicketContext } from "./supportContext.js";

/**
 * Small context chip for ticket rows + detail header, rendered only when
 * the ticket carries our frontend context header. Otherwise null.
 */
export default function TicketContextChip({ ticket }) {
  const context = parseTicketContext(ticket);
  if (!context) return null;
  return (
    <span className="ce-cluster" title={context.header}>
      <span className="ce-pill">{context.kind}</span>
      {context.rest && <span className="ce-small ce-muted">{context.rest}</span>}
    </span>
  );
}
