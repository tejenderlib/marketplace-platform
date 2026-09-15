/** Shared ticket/report pill mappings for user-facing pages (display only). */

export function ticketStatusPill(status) {
  switch (status) {
    case "OPEN":
      return "pill pill-ending";
    case "IN_PROGRESS":
      return "pill pill-sold";
    case "RESOLVED":
      return "pill pill-paid";
    case "WAITING_FOR_CUSTOMER":
    case "CLOSED":
      return "pill";
    default:
      return "pill";
  }
}

export function ticketPriorityPill(priority) {
  switch (priority) {
    case "HIGH":
    case "URGENT":
      return "pill pill-cancelled";
    default:
      return "pill";
  }
}

export function reportStatusPill(status) {
  switch (status) {
    case "OPEN":
      return "pill pill-ending";
    case "UNDER_REVIEW":
      return "pill pill-sold";
    case "RESOLVED":
      return "pill pill-paid";
    case "DISMISSED":
      return "pill";
    default:
      return "pill";
  }
}

export function humanize(value) {
  if (!value) return "—";
  return String(value)
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
