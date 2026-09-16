import Pill, { pillLabel } from "../ui/Pill.jsx";
import Button from "../ui/Button.jsx";
import TicketContextChip from "./TicketContextChip.jsx";

function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * One ticket row card. detailBase selects standalone ("/support") vs
 * workspace ("/profile/support") detail links; all behavior is identical.
 */
export default function TicketCard({ ticket, detailBase = "/support" }) {
  const href = `#${detailBase}/${ticket.id}`;
  return (
    <li className="ce-ticket">
      <div>
        <p className="ce-item-title">
          <a href={href}>{ticket.subject}</a>
        </p>
        <p className="ce-small ce-muted">
          #{ticket.id.slice(0, 8)} · Opened {formatDateTime(ticket.created_at)}
          {" · Updated "}
          {formatDateTime(ticket.updated_at)}
        </p>
        <p className="ce-cluster">
          <TicketContextChip ticket={ticket} />
          <Pill status={ticket.status}>{pillLabel(ticket.status)}</Pill>
          <Pill status={ticket.priority}>
            {pillLabel(ticket.priority)} priority
          </Pill>
        </p>
      </div>
      <div>
        <Button variant="ghost" size="sm" href={href} aria-label={`View ticket ${ticket.subject}`}>
          View
        </Button>
      </div>
    </li>
  );
}
