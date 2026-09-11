import { useCallback, useEffect, useState } from "react";

import { ApiError } from "../api/client.js";
import { formatPrice } from "../data/listings.js";
import { getOrder, myOrders } from "../api/checkout.js";
import { useAuth } from "../auth/AuthContext.jsx";

function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

const LIMIT = 20;

export function OrdersPage() {
  const { isAuthenticated, authFetch, redirectToLogin } = useAuth();
  const [offset, setOffset] = useState(0);
  const [state, setState] = useState({ loading: true, error: null, items: [], total: 0 });

  const load = useCallback(async () => {
    setState({ loading: true, error: null, items: [], total: 0 });
    try {
      const data = await myOrders(authFetch, { limit: LIMIT, offset });
      setState({ loading: false, error: null, items: data.items, total: data.total });
    } catch (err) {
      setState({
        loading: false,
        error: err instanceof ApiError ? `Could not load orders (${err.status}).` : "Network error.",
        items: [],
        total: 0,
      });
    }
  }, [authFetch, offset]);

  useEffect(() => {
    if (!isAuthenticated) {
      redirectToLogin();
      return;
    }
    load();
  }, [isAuthenticated, load, redirectToLogin]);

  if (!isAuthenticated) {
    return (
      <div className="content">
        <p className="muted">Redirecting to login…</p>
      </div>
    );
  }

  const page = Math.floor(offset / LIMIT) + 1;
  const pages = Math.max(1, Math.ceil(state.total / LIMIT));

  return (
    <div className="content">
      <h1>My Orders</h1>
      {state.loading && <p className="muted" role="status">Loading orders…</p>}
      {state.error && (
        <div className="empty-state" role="alert">
          <p>{state.error}</p>
          <button type="button" className="btn btn-primary" onClick={load}>Retry</button>
        </div>
      )}
      {!state.loading && !state.error && state.items.length === 0 && (
        <div className="empty-state">
          <p>No orders yet.</p>
          <a className="btn btn-primary" href="#/">Browse listings</a>
        </div>
      )}
      {!state.error && state.items.length > 0 && (
        <>
          <div className="table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Ordered</th>
                </tr>
              </thead>
              <tbody>
                {state.items.map((order) => (
                  <tr key={order.id}>
                    <td><a href={`#/orders/${order.id}`}>{order.listing_title_snapshot}</a></td>
                    <td>{formatPrice(order.total_minor)}</td>
                    <td><span className="pill">{order.status}</span></td>
                    <td>{formatDateTime(order.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination storefront-pagination">
            <button type="button" className="btn btn-ghost" disabled={page <= 1} onClick={() => setOffset(offset - LIMIT)}>
              ← Prev
            </button>
            <span>Page {page} of {pages}</span>
            <button type="button" className="btn btn-ghost" disabled={page >= pages} onClick={() => setOffset(offset + LIMIT)}>
              Next →
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function OrderDetailPage({ id }) {
  const { isAuthenticated, authFetch, redirectToLogin } = useAuth();
  const [state, setState] = useState({ loading: true, error: null, order: null });

  const load = useCallback(async () => {
    setState({ loading: true, error: null, order: null });
    try {
      const order = await getOrder(authFetch, id);
      setState({ loading: false, error: null, order });
    } catch (err) {
      setState({
        loading: false,
        error: err instanceof ApiError ? `Could not load order (${err.status}).` : "Network error.",
        order: null,
      });
    }
  }, [authFetch, id]);

  useEffect(() => {
    if (!isAuthenticated) {
      redirectToLogin();
      return;
    }
    load();
  }, [isAuthenticated, load, redirectToLogin]);

  if (!isAuthenticated) {
    return (
      <div className="content">
        <p className="muted">Redirecting to login…</p>
      </div>
    );
  }
  if (state.loading) return <div className="content"><p className="muted" role="status">Loading order…</p></div>;
  if (state.error) {
    return (
      <div className="content">
        <div className="empty-state" role="alert">
          <p>{state.error}</p>
          <button type="button" className="btn btn-primary" onClick={load}>Retry</button>
        </div>
      </div>
    );
  }
  if (!state.order) return <div className="content"><p className="muted">Order not found.</p></div>;

  const order = state.order;
  const snap = order.shipping_snapshot;
  return (
    <div className="content">
      <a className="back-link" href="#/orders">← My orders</a>
      <h1>Order</h1>
      <div className="detail-grid">
        <div className="detail-card">
          <h2>Summary</h2>
          <dl className="kv">
            <dt>Item</dt><dd>{order.listing_title_snapshot}</dd>
            <dt>Subtotal</dt><dd>{formatPrice(order.subtotal_minor)}</dd>
            <dt>Shipping</dt><dd>{formatPrice(order.shipping_minor)}</dd>
            <dt>Total</dt><dd><strong>{formatPrice(order.total_minor)}</strong></dd>
            <dt>Status</dt><dd><span className="pill">{order.status}</span></dd>
            <dt>Ordered</dt><dd>{formatDateTime(order.created_at)}</dd>
            <dt>Paid at</dt><dd>{formatDateTime(order.paid_at)}</dd>
          </dl>
          <h2>Payments</h2>
          {order.payments.length === 0 && <p className="muted">No payment attempts yet.</p>}
          {order.payments.map((pay) => (
            <dl className="kv" key={pay.id}>
              <dt>Amount</dt><dd>{formatPrice(pay.amount_minor)}</dd>
              <dt>Status</dt><dd><span className="pill">{pay.status}</span></dd>
              <dt>Provider</dt><dd>{pay.provider}</dd>
              {pay.failure_message && <><dt>Failure</dt><dd>{pay.failure_message}</dd></>}
            </dl>
          ))}
          {order.status === "PENDING_PAYMENT" || order.status === "PAYMENT_FAILED" ? (
            <a className="btn btn-primary" href={`#/checkout/payment/${order.id}`}>
              Continue to payment
            </a>
          ) : null}
        </div>
        <div className="detail-card">
          <h2>Delivery address (snapshot)</h2>
          {snap ? (
            <dl className="kv">
              <dt>Recipient</dt><dd>{snap.recipient_name}</dd>
              <dt>Address</dt><dd>{[snap.line1, snap.line2].filter(Boolean).join(", ")}</dd>
              <dt>City</dt><dd>{[snap.city, snap.region].filter(Boolean).join(", ")}</dd>
              <dt>Country</dt><dd>{snap.country}</dd>
              <dt>Contact</dt><dd>{order.contact_email_normalized}</dd>
            </dl>
          ) : (
            <p className="muted">No snapshot on file.</p>
          )}
          <h2>Status history</h2>
          <ol className="history-list">
            {order.history.map((h) => (
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
