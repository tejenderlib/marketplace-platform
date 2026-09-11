import { useState } from "react";

import { adminAction } from "../../api/admin.js";
import { ApiError } from "../../api/client.js";
import { formatPrice } from "../../data/listings.js";
import {
  ActionFeedback,
  EmptyState,
  ErrorState,
  FilterBar,
  FilterSearch,
  FilterSelect,
  Loading,
  Pagination,
  describeActionError,
  formatDateTime,
  useAdminData,
} from "../components/ui.jsx";
import ModerationDialog from "../components/ModerationDialog.jsx";

const STATUSES = ["DRAFT", "PENDING_REVIEW", "ACTIVE", "RESERVED", "SOLD", "EXPIRED", "REJECTED", "REMOVED", "ARCHIVED"];
const SALE_TYPES = ["FIXED_PRICE", "AUCTION"];
const LIMIT = 20;

const ACTIONS_FOR_STATUS = {
  PENDING_REVIEW: [
    ["approve", "Approve", "Approve this listing? It will become ACTIVE and visible to buyers."],
    ["reject", "Reject", "Reject this listing? It will be marked REJECTED with your reason."],
  ],
  ACTIVE: [
    ["remove", "Remove", "Remove this listing? Buyers will no longer see it. History is preserved."],
  ],
  REMOVED: [
    ["restore", "Restore", "Restore this listing? It will become ACTIVE again."],
  ],
};

export function ListingsPage() {
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState("");
  const [saleType, setSaleType] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [sellerId, setSellerId] = useState("");
  const [q, setQ] = useState("");
  const { loading, error, data, reload } = useAdminData("/admin/listings", {
    limit: LIMIT,
    offset,
    status,
    sale_type: saleType,
    category_id: categoryId,
    seller_id: sellerId,
    q,
  });

  return (
    <div>
      <h1>Listings</h1>
      <FilterBar onSubmit={() => setOffset(0)}>
        <FilterSearch label="Search" value={q} onChange={setQ} placeholder="Title or description…" />
        <FilterSelect label="Status" value={status} onChange={(v) => { setStatus(v); setOffset(0); }} options={STATUSES} />
        <FilterSelect label="Sale type" value={saleType} onChange={(v) => { setSaleType(v); setOffset(0); }} options={SALE_TYPES} />
        <FilterSearch label="Category ID" value={categoryId} onChange={(v) => { setCategoryId(v); setOffset(0); }} placeholder="UUID…" />
        <FilterSearch label="Seller ID" value={sellerId} onChange={(v) => { setSellerId(v); setOffset(0); }} placeholder="UUID…" />
        <button type="submit" className="btn btn-primary">Apply</button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => { setQ(""); setStatus(""); setSaleType(""); setCategoryId(""); setSellerId(""); setOffset(0); }}
        >
          Clear
        </button>
      </FilterBar>

      {loading && <Loading label="Loading listings…" />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && data.items.length === 0 && <EmptyState message="No listings match these filters." />}
      {data && data.items.length > 0 && (
        <>
          <div className="table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Price</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>City</th>
                  <th>Moderation</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <ListingRow key={item.id} item={item} onChanged={reload} />
                ))}
              </tbody>
            </table>
          </div>
          <Pagination total={data.total} limit={LIMIT} offset={offset} onChange={setOffset} />
        </>
      )}
    </div>
  );
}

export function ListingDetailPage({ id }) {
  const { loading, error, data, reload } = useAdminData(`/admin/listings/${id}`);
  const [dialog, setDialog] = useState(null);
  const [feedback, setFeedback] = useState(null);

  async function runAction(kind, reason) {
    try {
      await adminAction(`/admin/listings/${id}/${kind}`, reason);
      setDialog(null);
      setFeedback({ kind: "ok", message: `Listing ${kind}d.` });
      reload();
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 409)) {
        setDialog(null);
        setFeedback(describeActionError(err));
        reload();
      } else {
        throw err;
      }
    }
  }

  if (loading) return <Loading label="Loading listing…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <EmptyState message="Listing not found." />;
  const actions = ACTIONS_FOR_STATUS[data.status] ?? [];

  return (
    <div>
      <a className="back-link" href="#/admin/listings">← Back to listings</a>
      <h1>{data.title}</h1>
      <ActionFeedback feedback={feedback} onDismiss={() => setFeedback(null)} />
      {actions.length > 0 && (
        <div className="action-row">
          {actions.map(([kind, label]) => (
            <button
              key={kind}
              type="button"
              className={kind === "remove" ? "btn btn-danger" : "btn btn-ghost"}
              onClick={() => { setFeedback(null); setDialog(kind); }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {dialog && (
        <ModerationDialog
          title={`${dialog[0].toUpperCase() + dialog.slice(1)} listing`}
          explanation={
            (ACTIONS_FOR_STATUS[data.status] ?? []).find(([k]) => k === dialog)?.[2]
            ?? "Confirm this moderation action."
          }
          confirmLabel={dialog[0].toUpperCase() + dialog.slice(1)}
          onCancel={() => setDialog(null)}
          onConfirm={(reason) => runAction(dialog, reason)}
        />
      )}
      <div className="detail-grid">
        <div className="detail-card">
          <h2>Listing</h2>
          <dl className="kv">
            <dt>Price</dt>
            <dd>{data.fixed_price_minor != null ? formatPrice(data.fixed_price_minor) : "Auction — see bids"}</dd>
            <dt>Sale type</dt><dd><span className="pill">{data.sale_type}</span></dd>
            <dt>Status</dt><dd><span className="pill">{data.status}</span></dd>
            <dt>Condition</dt><dd>{data.condition}</dd>
            <dt>Category</dt><dd>{data.category?.name} ({data.category?.slug})</dd>
            <dt>Location</dt><dd>{[data.city, data.region, data.country_code].filter(Boolean).join(", ")}</dd>
            <dt>Offers enabled</dt><dd>{String(data.offers_enabled)}</dd>
            <dt>Published</dt><dd>{formatDateTime(data.published_at)}</dd>
            <dt>Expires</dt><dd>{formatDateTime(data.expires_at)}</dd>
            <dt>Sold</dt><dd>{formatDateTime(data.sold_at)}</dd>
          </dl>
          {data.description && <p className="muted">{data.description}</p>}
        </div>
        <div className="detail-card">
          <h2>Seller</h2>
          <dl className="kv">
            <dt>Seller ID</dt><dd className="mono">{data.seller?.id}</dd>
            <dt>Name</dt><dd>{data.seller?.display_name ?? "—"}</dd>
          </dl>
          {data.auction && (
            <>
              <h2>Auction</h2>
              <dl className="kv">
                <dt>Status</dt><dd>{data.auction.status}</dd>
                <dt>Current bid</dt>
                <dd>{data.auction.current_bid_minor != null ? formatPrice(data.auction.current_bid_minor) : "—"}</dd>
              </dl>
            </>
          )}
        </div>
      </div>
      {data.images?.length > 0 && (
        <div className="detail-card">
          <h2>Images ({data.images.length})</h2>
          <ul className="kv-list">
            {data.images.map((img) => (
              <li key={img.id}>
                <span className="mono">{img.storage_key}</span>
                <span className="muted small">
                  {" "}· {img.content_type} · {(img.byte_size / 1024).toFixed(1)} KB ·
                  order #{img.sort_order}
                  {img.is_primary ? " · primary" : ""}
                  {img.alt_text ? ` · “${img.alt_text}”` : ""}
                </span>
              </li>
            ))}
          </ul>
          <p className="muted small">Storage keys resolve via the future file-storage backend.</p>
        </div>
      )}
    </div>
  );
}

function ListingRow({ item, onChanged }) {
  const [dialog, setDialog] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const actions = ACTIONS_FOR_STATUS[item.status] ?? [];

  async function runAction(kind, reason) {
    try {
      await adminAction(`/admin/listings/${item.id}/${kind}`, reason);
      setDialog(null);
      setFeedback({ kind: "ok", message: `Listing ${kind}d.` });
      onChanged();
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 409)) {
        setDialog(null);
        setFeedback(describeActionError(err));
        onChanged();
      } else {
        throw err;
      }
    }
  }

  return (
    <tr>
      <td>
        <a href={`#/admin/listings/${item.id}`}>{item.title}</a>
        {feedback && (
          <div className={feedback.kind === "ok" ? "notice-ok" : "notice-err"}>
            <span>{feedback.message}</span>
          </div>
        )}
      </td>
      <td>{item.fixed_price_minor != null ? formatPrice(item.fixed_price_minor) : "—"}</td>
      <td><span className="pill">{item.sale_type}</span></td>
      <td><span className="pill">{item.status}</span></td>
      <td>{item.city}</td>
      <td>
        {actions.length === 0 && <span className="muted">—</span>}
        {actions.map(([kind, label]) => (
          <button
            key={kind}
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => { setFeedback(null); setDialog(kind); }}
          >
            {label}
          </button>
        ))}
        {dialog && (
          <ModerationDialog
            title={`${dialog[0].toUpperCase() + dialog.slice(1)} listing`}
            explanation={`Confirm ${dialog} for “${item.title}”. State changes are validated by the backend.`}
            confirmLabel={dialog[0].toUpperCase() + dialog.slice(1)}
            onCancel={() => setDialog(null)}
            onConfirm={(reason) => runAction(dialog, reason)}
          />
        )}
      </td>
    </tr>
  );
}
