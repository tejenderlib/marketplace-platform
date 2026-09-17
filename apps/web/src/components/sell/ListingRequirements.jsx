import { toMinor, validateBasics, validateSale } from "./shared.js";

/**
 * ListingRequirements: live checklist for the Sell Item flow. Rules mirror
 * the shared client validators (server stays authoritative); auction
 * completeness is required only when the listing is an auction.
 * Pass `only` with check keys to render a subset (same logic, no duplication).
 */
export default function ListingRequirements({ form, images, only }) {
  const basics = validateBasics(form);
  const sale = validateSale(form);
  const hasPhoto = (images ?? []).length > 0;
  const hasDescription = (form.description ?? "").trim().length > 0;
  const isAuction = form.sale_type === "AUCTION";

  const priceOk =
    form.sale_type === "FIXED_PRICE"
      ? toMinor(form.price_rupees) != null && !sale.price_rupees
      : true;
  const auctionOk = !isAuction || (Object.keys(sale).length === 0 && hasDescription);

  const allChecks = [
    { key: "photo", label: "At least 1 photo", ok: hasPhoto },
    { key: "title", label: "Title is required", ok: !basics.title },
    { key: "category", label: "Category is required", ok: !basics.category_id },
    { key: "description", label: "Description is required", ok: hasDescription && !basics.description },
    { key: "price", label: "Price is required", ok: priceOk },
    ...(isAuction ? [{ key: "auction", label: "Auction information is complete", ok: auctionOk }] : []),
  ];
  const checks = only ? allChecks.filter((check) => only.includes(check.key)) : allChecks;

  const done = checks.filter((check) => check.ok).length;

  return (
    <div className="sell-requirements">
      <h2 className="ce-h3">✓ Requirements</h2>
      <p className="ce-small ce-muted">
        {done} of {checks.length} complete
      </p>
      <ul className="sell-checklist">
        {checks.map((check) => (
          <li key={check.label} className={check.ok ? "is-ok" : "is-pending"}>
            <span className="sell-check-icon" aria-hidden="true">
              {check.ok ? "✓" : "○"}
            </span>
            <span>{check.label}</span>
            <span className="ce-visually-hidden">{check.ok ? " (complete)" : " (missing)"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
