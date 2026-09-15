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

const STATUSES = ["CREATED", "PENDING", "SUCCEEDED", "FAILED", "CANCELLED"];
const PROVIDERS = ["DUMMY"];
const LIMIT = 20;

export default function PaymentsPage() {
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState("");
  const [provider, setProvider] = useState("");
  const [orderId, setOrderId] = useState("");
  const { loading, error, data, reload } = useAdminData("/admin/payments", {
    limit: LIMIT,
    offset,
    status,
    provider,
    order_id: orderId,
  });

  return (
    <div>
      <h1>Payments</h1>
      <FilterBar onSubmit={() => setOffset(0)}>
        <FilterSelect label="Status" value={status} onChange={(v) => { setStatus(v); setOffset(0); }} options={STATUSES} />
        <FilterSelect label="Provider" value={provider} onChange={(v) => { setProvider(v); setOffset(0); }} options={PROVIDERS} />
        <FilterSearch label="Order ID" value={orderId} onChange={(v) => { setOrderId(v); setOffset(0); }} placeholder="UUID…" />
        <button type="submit" className="btn btn-primary">Apply</button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => { setStatus(""); setProvider(""); setOrderId(""); setOffset(0); }}
        >
          Clear
        </button>
      </FilterBar>

      {loading && <Loading label="Loading payments…" />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && data.length === 0 && <EmptyState message="No payments match these filters." />}
      {data && data.length > 0 && (
        <>
          <div className="table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Provider</th>
                  <th>Order</th>
                  <th>Initiated</th>
                </tr>
              </thead>
              <tbody>
                {data.map((pay) => (
                  <tr key={pay.id}>
                    <td>{formatPrice(pay.amount_minor)}</td>
                    <td><StatusPill value={pay.status} /></td>
                    <td>{pay.provider}</td>
                    <td className="mono small">{pay.order_id.slice(0, 8)}…</td>
                    <td>{formatDateTime(pay.initiated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination total={offset + data.length + (data.length >= LIMIT ? 1 : 0)} limit={LIMIT} offset={offset} onChange={setOffset} />
        </>
      )}
    </div>
  );
}
