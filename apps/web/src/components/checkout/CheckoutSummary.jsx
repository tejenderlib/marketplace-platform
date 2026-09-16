import { formatPrice } from "../../data/listings.js";
import Button from "../ui/Button.jsx";

/**
 * Sticky order summary card used by all checkout pages: source pill,
 * item title, amount rows from real totals, error slot, and the single
 * primary action. Pages keep their own submit handlers and wording.
 */
export default function CheckoutSummary({
  eyebrow,
  title,
  titleHref,
  sourcePill,
  rows,
  totalLabel,
  totalMinor,
  error,
  busy,
  submitDisabled,
  submitLabel,
  note,
}) {
  return (
    <aside aria-label="Order summary">
      <div className="ce-card ce-txn">
        <p className="ce-micro ce-muted">{eyebrow}</p>
        <h2 className="ce-h3">
          {titleHref ? <a href={titleHref}>{title}</a> : title}
        </h2>
        {sourcePill}
        <dl className="ce-lines">
          {rows.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd><strong>{row.value}</strong></dd>
            </div>
          ))}
        </dl>
        <p className="ce-total">
          <span>{totalLabel}</span>
          <strong className="ce-tnum">{formatPrice(totalMinor)}</strong>
        </p>
        {error && (
          <p className="ce-error" role="alert">
            {error}
          </p>
        )}
        <Button variant="primary" type="submit" block disabled={busy || submitDisabled}>
          {busy ? "Working…" : submitLabel}
        </Button>
        {note && <p className="ce-small ce-muted">{note}</p>}
      </div>
    </aside>
  );
}
