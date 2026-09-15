/** Shared order/checkout display mappings (values untouched, visuals only). */

export function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export function statusPillClass(status) {
  switch (status) {
    case "ACTIVE":
    case "DRAFT":
    case "PAID":
      return "pill pill-active";
    case "PENDING_PAYMENT":
    case "PENDING_REVIEW":
    case "AWAITING_CHECKOUT":
      return "pill pill-ending";
    case "PROCESSING":
    case "READY_FOR_DELIVERY":
    case "RESERVED":
    case "ORDER_CREATED":
      return "pill pill-sold";
    case "SHIPPED":
    case "DELIVERED":
    case "PAYMENT_COMPLETED":
      return "pill pill-paid";
    case "PAYMENT_FAILED":
    case "PAYMENT_EXPIRED":
    case "CANCELLED":
    case "REJECTED":
    case "REMOVED":
    case "EXPIRED":
      return "pill pill-cancelled";
    case "REFUNDED":
      return "pill pill-auction";
    default:
      return "pill";
  }
}

export function statusLabel(status) {
  if (!status) return "—";
  return status
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

export function sourceLabel(source) {
  switch (source) {
    case "FIXED_PRICE":
      return "Fixed price";
    case "ACCEPTED_OFFER":
      return "Accepted offer";
    case "AUCTION_WIN":
      return "Auction win";
    default:
      return source ?? "—";
  }
}

/** Canonical forward stages for the visual timeline. */
export const TIMELINE_STAGES = [
  "PENDING_PAYMENT",
  "PAID",
  "PROCESSING",
  "READY_FOR_DELIVERY",
  "SHIPPED",
  "DELIVERED",
];

export const TERMINAL_STAGES = ["CANCELLED", "REFUNDED"];
