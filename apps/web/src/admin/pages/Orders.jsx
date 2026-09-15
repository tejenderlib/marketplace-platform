import { useState } from "react";

import { formatPrice } from "../../data/listings.js";
import {
  EmptyState,
  ErrorState,
  FilterBar,
  FilterSearch,
  FilterSelect,
  Loading,
  Pagination,
  formatDateTime,
  StatusPill,
  useAdminData,
} from "../components/ui.jsx";

const STATUSES = ["PENDING_PAYMENT", "PAYMENT_FAILED", "PAID", "PROCESSING", "READY_FOR_DELIVERY", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"];
const SOURCES = ["FIXED_PRICE", "ACCEPTED_OFFER", "AUCTION_WIN"];
const LIMIT = 20;

export function OrdersPage() {
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [buyerId, setBuyerId] = useState("");
  const [sellerId, setSellerId] = useState("");
  const { loading, error, data, reload } = useAdminData("/admin/orders", {
    limit: LIMIT,
    offset,
    status,
    source,
    buyer_id: buyerId,
    seller_id: sellerId,
  });

  return (
    <div>
      <h1>Orders</h1>
      <FilterBar onSubmit={() => setOffset(0)}>
        <FilterSelect label="Status" value={status} onChange={(v) => { setStatus(v); setOffset(0); }} options={STATUSES} />
        <FilterSelect label="Source" value={source} onChange={(v) => { setSource(v); setOffset(0); }} options={SOURCES} />
        <FilterSearch label="Buyer ID" value={buyerId} onChange={(v) => { setBuyerId(v); setOffset(0); }} placeholder="UUID…" />
        <FilterSearch label="Seller ID" value={sellerId} onChange={(v) => { setSellerId(v); setOffset(0); }} placeholder="UUID…" />
        <button type="submit" className="btn btn-primary">Apply</button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => { setStatus(""); setSource(""); setBuyerId(""); setSellerId(""); setOffset(0); }}
        >
          Clear
        </button>
      </FilterBar>

      {loading && <Loading label="Loading orders…" />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && data.items.length === 0 && <EmptyState message="No orders match these filters." />}
      {data && data.items.length > 0 && (
        <>
          <div className="table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Buyer</th>
                  <th>Seller</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Source</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <a href={`#/admin/orders/${order.id}`}>{order.listing_title_snapshot}</a>
                      <div className="muted small mono">{order.id.slice(0, 8)}…</div>
                    </td>
                    <td>{order.buyer?.display_name ?? "—"}</td>
                    <td>{order.seller?.display_name ?? "—"}</td>
                    <td>{formatPrice(order.total_minor)}</td>
                    <td><StatusPill value={order.status} /></td>
                    <td>{order.source}</td>
                    <td>{formatDateTime(order.created_at)}</td>
                  </tr>
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

export function OrderDetailPage({ id }) {
  const { loading, error, data, reload } = useAdminData(`/admin/orders/${id}`);

  if (loading) return <Loading label="Loading order…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <EmptyState message="Order not found." />;

  return (
    <div>
      <a className="back-link" href="#/admin/orders">← Back to orders</a>
      <h1>Order</h1>
      <div className="detail-grid">
        <div className="detail-card">
          <h2>Summary</h2>
          <dl className="kv">
            <dt>Status</dt><dd><StatusPill value={data.status} /></dd>
            <dt>Source</dt><dd>{data.source}</dd>
            <dt>Subtotal</dt><dd>{formatPrice(data.subtotal_minor)}</dd>
            <dt>Shipping</dt><dd>{formatPrice(data.shipping_minor)}</dd>
            <dt>Total</dt><dd><strong>{formatPrice(data.total_minor)}</strong></dd>
            <dt>Buyer</dt><dd>{data.buyer?.display_name ?? data.buyer_id}</dd>
            <dt>Seller</dt><dd>{data.seller?.display_name ?? data.seller_id}</dd>
            <dt>Paid at</dt><dd>{formatDateTime(data.paid_at)}</dd>
          </dl>
        </div>
        <div className="detail-card">
          <h2>Payments ({data.payments?.length ?? 0})</h2>
          {(data.payments ?? []).length === 0 && <p className="muted">No payments yet.</p>}
          {(data.payments ?? []).map((pay) => (
            <dl className="kv" key={pay.id}>
              <dt>Amount</dt><dd>{formatPrice(pay.amount_minor)}</dd>
              <dt>Status</dt><dd><StatusPill value={pay.status} /></dd>
              <dt>Provider</dt><dd>{pay.provider}</dd>
              <dt>Reference</dt><dd className="mono small">{pay.provider_reference ?? "—"}</dd>
              <dt>Initiated</dt><dd>{formatDateTime(pay.initiated_at)}</dd>
              {pay.failure_message && <><dt>Failure</dt><dd>{pay.failure_message}</dd></>}
            </dl>
          ))}
          <h2>Status history</h2>
          <ol className="history-list">
            {(data.history ?? []).map((h) => (
              <li key={`${h.to_status}-${h.created_at}`}>
                <span className="pill">{h.from_status ?? "∅"} → {h.to_status}</span>
                <span className="muted small"> {formatDateTime(h.created_at)}{h.note ? ` · ${h.note}` : ""}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
