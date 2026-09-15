import { formatPrice } from "../../data/listings.js";

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
    <aside className="co-summary" aria-label="Order summary">
      <div className="co-summary-card">
        <p className="co-eyebrow">{eyebrow}</p>
        <h2 className="co-title">
          {titleHref ? <a href={titleHref}>{title}</a> : title}
        </h2>
        {sourcePill}
        <dl className="kv co-lines">
          {rows.map((row) => (
            <div className="co-line" key={row.label}>
              <dt>{row.label}</dt>
              <dd className={row.strong ? "co-strong" : undefined}>{row.value}</dd>
            </div>
          ))}
        </dl>
        <p className="co-total">
          <span>{totalLabel}</span>
          <strong>{formatPrice(totalMinor)}</strong>
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-bid" disabled={busy || submitDisabled}>
          {busy ? "Working…" : submitLabel}
        </button>
        {note && <p className="muted small">{note}</p>}
      </div>
    </aside>
  );
}
