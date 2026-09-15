import { formatPrice } from "../../data/listings.js";

const STATUS_FILTERS = [
  "",
  "DRAFT",
  "ACTIVE",
  "RESERVED",
  "SOLD",
  "EXPIRED",
  "REMOVED",
  "ARCHIVED",
];

function statusPillClass(status) {
  switch (status) {
    case "ACTIVE":
    case "DRAFT":
      return "pill pill-active";
    case "REMOVED":
      return "pill pill-cancelled";
    case "RESERVED":
      return "pill pill-auction";
    case "SOLD":
      return "pill pill-sold";
    case "EXPIRED":
      return "pill pill-cancelled";
    // PENDING_REVIEW / REJECTED are legacy pre-approval states; they render
    // generically if a historical row is encountered.
    case "PENDING_REVIEW":
      return "pill pill-ending";
    case "REJECTED":
      return "pill pill-cancelled";
    default:
      return "pill";
  }
}

function statusLabel(status) {
  return status
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

/** Seller's own listings with lifecycle-legal actions only. */
export default function SellerDashboard({
  items,
  total,
  loading,
  error,
  statusFilter,
  onStatusFilter,
  onRetry,
  onNew,
  onEdit,
  onSubmitDirect,
  onArchive,
  onView,
  busyId,
}) {
  return (
    <section className="sell-dash" aria-labelledby="sell-dash-heading">
      <div className="section-head">
        <h2 id="sell-dash-heading">My listings</h2>
        <button type="button" className="btn btn-sell" onClick={onNew}>
          + New Listing
        </button>
      </div>

      <div className="sale-filter" role="group" aria-label="Filter by status">
        {STATUS_FILTERS.map((value) => (
          <button
            key={value}
            type="button"
            className={statusFilter === value ? "chip is-active" : "chip"}
            aria-pressed={statusFilter === value}
            onClick={() => onStatusFilter(value)}
          >
            {value === "" ? `All (${total})` : statusLabel(value)}
          </button>
        ))}
      </div>

      {loading && <p className="muted" role="status">Loading your listings…</p>}
      {error && (
        <div className="empty-state" role="alert">
          <p>{error}</p>
          <button type="button" className="btn btn-primary" onClick={onRetry}>
            Retry
          </button>
        </div>
      )}
      {!loading && !error && items.length === 0 && (
        <div className="empty-state">
          <p>No listings here yet.</p>
          <button type="button" className="btn btn-primary" onClick={onNew}>
            Create your first listing
          </button>
        </div>
      )}
      {!loading && !error && items.length > 0 && (
        <ul className="sell-list">
          {items.map((item) => {
            const busy = busyId === item.id;
            return (
              <li key={item.id} className="sell-item">
                <div className="sell-item-main">
                  <p className="sell-item-title">{item.title}</p>
                  <p className="muted small">
                    {item.sale_type === "AUCTION"
                      ? "Auction"
                      : item.fixed_price_minor != null
                        ? formatPrice(item.fixed_price_minor)
                        : "—"}
                    {" · "}
                    {item.category?.name ?? "—"}
                  </p>
                </div>
                <span className={statusPillClass(item.status)}>{statusLabel(item.status)}</span>
                <div className="sell-item-actions">
                  {item.status === "DRAFT" && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={busy}
                      onClick={() => onEdit(item)}
                    >
                      Continue
                    </button>
                  )}
                  {item.status === "DRAFT" && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={busy}
                      onClick={() => onSubmitDirect(item)}
                    >
                      Publish
                    </button>
                  )}
                  {item.status === "REMOVED" && (
                    <span className="muted small">Removed by moderation</span>
                  )}
                  {(item.status === "ACTIVE" || item.status === "DRAFT") && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={busy}
                      onClick={() => onArchive(item)}
                    >
                      Archive
                    </button>
                  )}
                  {item.status === "ACTIVE" && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={busy}
                      onClick={() => onView(item)}
                    >
                      View
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
