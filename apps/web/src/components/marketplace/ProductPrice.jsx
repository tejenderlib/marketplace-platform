/**
 * ProductPrice: tabular price using the existing display convention.
 * `listing.priceLabel` is already formatted server-side style
 * (formatPrice of the authoritative minor-unit row) — rendered as-is so
 * money semantics never change. Styling only.
 */

export default function ProductPrice({ listing, size }) {
  return (
    <p className={size === "lg" ? "ce-price ce-price--lg ce-tnum" : "ce-price ce-tnum"}>
      {listing.priceLabel}
      {listing.priceNote ? <span className="ce-price-note"> · {listing.priceNote}</span> : null}
    </p>
  );
}
