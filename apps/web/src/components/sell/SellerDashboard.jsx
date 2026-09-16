import { formatPrice } from "../../data/listings.js";
import Button from "../ui/Button.jsx";
import Pill from "../ui/Pill.jsx";
import { EmptyState, ErrorState, LoadingState } from "../ui/States.jsx";

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

function statusLabel(status) {
  return status
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

/** Seller's own listings with lifecycle-legal actions only. Logic unchanged. */
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
    <section aria-labelledby="sell-dash-heading" className="ce-stack">
      <div className="ce-discovery-head">
        <h2 id="sell-dash-heading" className="ce-h2">My listings</h2>
        <Button variant="primary" size="sm" onClick={onNew}>
          + New Listing
        </Button>
      </div>

      <div className="ce-segmented" role="group" aria-label="Filter by status">
        {STATUS_FILTERS.map((value) => (
          <button
            key={value}
            type="button"
            className={statusFilter === value ? "ce-btn ce-btn--secondary ce-btn--sm is-active" : "ce-btn ce-btn--ghost ce-btn--sm"}
            aria-pressed={statusFilter === value}
            onClick={() => onStatusFilter(value)}
          >
            {value === "" ? `All (${total})` : statusLabel(value)}
          </button>
        ))}
      </div>

      {loading && <LoadingState label="Loading your listings…" />}
      {error && <ErrorState message={error} onRetry={onRetry} />}
      {!loading && !error && items.length === 0 && (
        <EmptyState
          title="No listings here yet"
          action={
            <Button variant="primary" size="sm" onClick={onNew}>
              Create your first listing
            </Button>
          }
        />
      )}
      {!loading && !error && items.length > 0 && (
        <ul className="ce-sell-list">
          {items.map((item) => {
            const busy = busyId === item.id;
            return (
              <li key={item.id} className="ce-sell-item">
                <div className="ce-sell-item-main">
                  <p className="ce-sell-item-title">{item.title}</p>
                  <p className="ce-small ce-muted">
                    {item.sale_type === "AUCTION"
                      ? "Auction"
                      : item.fixed_price_minor != null
                        ? formatPrice(item.fixed_price_minor)
                        : "—"}
                    {" · "}
                    {item.category?.name ?? "—"}
                  </p>
                </div>
                <Pill status={item.status}>{statusLabel(item.status)}</Pill>
                <div className="ce-cluster">
                  {item.status === "DRAFT" && (
                    <Button variant="ghost" size="sm" disabled={busy} onClick={() => onEdit(item)}>
                      Continue
                    </Button>
                  )}
                  {item.status === "DRAFT" && (
                    <Button variant="secondary" size="sm" disabled={busy} onClick={() => onSubmitDirect(item)}>
                      Publish
                    </Button>
                  )}
                  {item.status === "REMOVED" && (
                    <span className="ce-small ce-muted">Removed by moderation</span>
                  )}
                  {(item.status === "ACTIVE" || item.status === "DRAFT") && (
                    <Button variant="ghost" size="sm" disabled={busy} onClick={() => onArchive(item)}>
                      Archive
                    </Button>
                  )}
                  {item.status === "ACTIVE" && (
                    <Button variant="ghost" size="sm" disabled={busy} onClick={() => onView(item)}>
                      View
                    </Button>
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
