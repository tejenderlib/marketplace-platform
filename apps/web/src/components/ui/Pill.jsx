/**
 * CE Pill: single status registry. Maps backend status VALUES to CE pill
 * modifiers without changing any value. Consolidates checkout/orderDisplay,
 * statusPills (ticket/report), admin ui, and the local listing/seller maps.
 */

const SUCCESS = new Set([
  "ACTIVE", "PAID", "DELIVERED", "PAYMENT_COMPLETED", "RESOLVED",
  "WON", "WINNING", "SETTLED", "ACCEPTED", "LIVE",
]);
const WARNING = new Set([
  "PENDING", "PENDING_PAYMENT", "PENDING_REVIEW", "PENDING_VERIFICATION",
  "AWAITING_CHECKOUT", "OPEN", "ENDING", "OUTBID",
]);
const INFO = new Set([
  "RESERVED", "PROCESSING", "READY_FOR_DELIVERY", "SHIPPED", "ORDER_CREATED",
  "SOLD", "IN_PROGRESS", "UNDER_REVIEW", "SCHEDULED",
]);
const DANGER = new Set([
  "CANCELLED", "PAYMENT_FAILED", "PAYMENT_EXPIRED", "EXPIRED", "REJECTED",
  "REMOVED", "REVOKE", "REVOKED", "SUSPENDED", "FAILED", "HIGH", "URGENT",
]);
const AUCTION = new Set(["AUCTION", "BIDDING"]);

export function pillModifier(status) {
  if (!status) return "";
  if (SUCCESS.has(status)) return "ce-pill--success";
  if (WARNING.has(status)) return "ce-pill--warning";
  if (INFO.has(status)) return "ce-pill--info";
  if (DANGER.has(status)) return "ce-pill--danger";
  if (AUCTION.has(status)) return "ce-pill--auction";
  return "";
}

export function pillLabel(status) {
  if (!status) return "—";
  return String(status)
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

/** Plain-language explanation of each ticket status (display copy only). */
export function ticketStatusBlurb(status) {
  switch (status) {
    case "OPEN":
      return "Your ticket is waiting for support.";
    case "IN_PROGRESS":
      return "Our support team is working on this.";
    case "WAITING_FOR_CUSTOMER":
      return "Support needs more information from you — please reply below.";
    case "RESOLVED":
      return "This issue has been marked resolved.";
    case "CLOSED":
      return "This ticket is closed.";
    default:
      return null;
  }
}

export default function Pill({ status, children, title, className }) {
  const cls = ["ce-pill", pillModifier(status), className ?? ""]
    .filter(Boolean)
    .join(" ");
  const label = children ?? pillLabel(status);
  return (
    <span className={cls} title={title ?? `Status: ${pillLabel(status)}`}>
      {label}
    </span>
  );
}
