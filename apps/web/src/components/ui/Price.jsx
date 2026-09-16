/**
 * CE Price: display-only wrapper around formatPrice (₹ + en-IN).
 * Contract: `formatPrice` takes MAJOR units (rupees). Accepts either
 * `rupees` or `minor` (paise, converted minor/100 at the call site —
 * conversion documented here, never hidden inside the formatter).
 */

import { formatPrice } from "../../data/listings.js";

export default function Price({ rupees, minor, note, size }) {
  const value = rupees ?? (minor != null ? minor / 100 : 0);
  const cls = ["ce-price", size === "lg" ? "ce-price--lg" : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <p className={cls}>
      {formatPrice(value)}
      {note ? <span className="ce-price-note"> · {note}</span> : null}
    </p>
  );
}
