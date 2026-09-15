const CATEGORIES = [
  { key: "orders", label: "Orders", hint: "Delivery, status, changes" },
  { key: "payments", label: "Payments", hint: "Charges, refunds, failures" },
  { key: "listings", label: "Listings", hint: "Posting, edits, visibility" },
  { key: "buying", label: "Buying", hint: "Offers and purchases" },
  { key: "selling", label: "Selling", hint: "Your listings and buyers" },
  { key: "account", label: "Account", hint: "Login, profile, settings" },
];

/**
 * Category selection cards. Auctions is intentionally a disabled future
 * option — no auction selector, API, or ID field exists yet.
 */
export default function SupportCategoryGrid({ selected, onSelect }) {
  return (
    <div>
      <ul className="support-categories" aria-label="Support categories">
        {CATEGORIES.map((cat) => (
          <li key={cat.key}>
            <button
              type="button"
              className={selected === cat.key ? "support-category is-active" : "support-category"}
              aria-pressed={selected === cat.key}
              onClick={() => onSelect(cat.key)}
            >
              <strong>{cat.label}</strong>
              <span className="muted small">{cat.hint}</span>
            </button>
          </li>
        ))}
        <li key="auctions" aria-disabled="true">
          <div className="support-category is-disabled" title="Auction-specific support is coming later">
            <strong>Auctions</strong>
            <span className="muted small">Coming soon — auction-specific support will use an Auction ID.</span>
          </div>
        </li>
      </ul>
    </div>
  );
}
