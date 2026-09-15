import { humanize, ticketPriorityPill, ticketStatusPill } from "../statusPills.js";
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
    <li className="order-card">
      <div className="order-main">
        <p className="order-title">
          <a href={href}>{ticket.subject}</a>
        </p>
        <p className="muted small">
          #{ticket.id.slice(0, 8)} · Opened {formatDateTime(ticket.created_at)}
          {" · Updated "}
          {formatDateTime(ticket.updated_at)}
        </p>
        <p className="order-pills">
          <TicketContextChip ticket={ticket} />
          <span className={ticketStatusPill(ticket.status)}>{humanize(ticket.status)}</span>
          <span className={ticketPriorityPill(ticket.priority)}>
            {humanize(ticket.priority)} priority
          </span>
        </p>
      </div>
      <div className="order-action">
        <a className="btn btn-ghost btn-sm" href={href} aria-label={`View ticket ${ticket.subject}`}>
          View
        </a>
      </div>
    </li>
  );
}
