import { useCallback, useEffect, useState } from "react";

import { ApiError } from "../api/client.js";
import { formatPrice } from "../data/listings.js";
import { getOrder, myOrders } from "../api/checkout.js";
import { createReview } from "../api/reviews.js";
import { useAuth } from "../auth/AuthContext.jsx";
import ReviewModal from "../components/ReviewModal.jsx";
import { useReviewedOrders } from "../hooks/useReviewedOrders.js";

function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

const LIMIT = 20;

export function OrdersPage() {
  const { isAuthenticated, authFetch, redirectToLogin } = useAuth();
  const [offset, setOffset] = useState(0);
  const [state, setState] = useState({ loading: true, error: null, items: [], total: 0 });
  const [reviewTarget, setReviewTarget] = useState(null);
  const [reviewNote, setReviewNote] = useState(null);
  const { reviewedIds, markReviewed } = useReviewedOrders();

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

  async function submitReview(payload) {
    try {
      await createReview(authFetch, payload);
      markReviewed(payload.order_id);
      setReviewTarget(null);
      setReviewNote("Thanks! Your review has been submitted.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        markReviewed(payload.order_id);
        setReviewTarget(null);
        setReviewNote("This order is already reviewed.");
      }
      throw err;
    }
  }

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
      {reviewNote && (
        <p className="form-ok" role="status">
          {reviewNote}
        </p>
      )}
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
                  <th>Buyer</th>
                  <th>Seller</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Review</th>
                  <th>Ordered</th>
                </tr>
              </thead>
              <tbody>
                {state.items.map((order) => (
                  <tr key={order.id}>
                    <td><a href={`#/orders/${order.id}`}>{order.listing_title_snapshot}</a></td>
                    <td>{order.buyer?.display_name ?? "—"}</td>
                    <td>{order.seller?.display_name ?? "—"}</td>
                    <td>{formatPrice(order.total_minor)}</td>
                    <td><span className="pill">{order.status}</span></td>
                    <td>
                      {order.status === "DELIVERED" ? (
                        reviewedIds.has(order.id) ? (
                          <span className="status-pill status-reviewed">Reviewed</span>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => {
                              setReviewNote(null);
                              setReviewTarget(order);
                            }}
                          >
                            Rate &amp; Review
                          </button>
                        )
                      ) : (
                        <span className="muted small">—</span>
                      )}
                    </td>
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
      {reviewTarget && (
        <ReviewModal
          order={reviewTarget}
          counterPartyName={reviewTarget.seller?.display_name ?? "this seller"}
          onClose={() => setReviewTarget(null)}
          onSubmit={submitReview}
        />
      )}
    </div>
  );
}

export function OrderDetailPage({ id }) {
  const { isAuthenticated, authFetch, redirectToLogin, user } = useAuth();
  const [state, setState] = useState({ loading: true, error: null, order: null });
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewNote, setReviewNote] = useState(null);
  const { reviewedIds, markReviewed } = useReviewedOrders();

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
  const reviewed = reviewedIds.has(order.id);

  async function submitReview(payload) {
    try {
      await createReview(authFetch, payload);
      markReviewed(payload.order_id);
      setReviewOpen(false);
      setReviewNote("Thanks! Your review has been submitted.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        markReviewed(payload.order_id);
        setReviewOpen(false);
        setReviewNote("This order is already reviewed.");
      }
      throw err;
    }
  }

  return (
    <div className="content">
      <a className="back-link" href="#/orders">← My orders</a>
      <h1>Order</h1>
      <div className="detail-grid">
        <div className="detail-card">
          <h2>Summary</h2>
          <dl className="kv">
            <dt>Item</dt><dd>{order.listing_title_snapshot}</dd>
            <dt>Buyer</dt><dd>{order.buyer?.display_name ?? "—"}</dd>
            <dt>Seller</dt><dd>{order.seller?.display_name ?? "—"}</dd>
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
          <h2>Review</h2>
          {reviewNote ? (
            <p className="form-ok" role="status">{reviewNote}</p>
          ) : order.status === "DELIVERED" ? (
            reviewed ? (
              <p className="muted small">You have reviewed this order.</p>
            ) : (
              <button type="button" className="btn btn-primary" onClick={() => setReviewOpen(true)}>
                Rate &amp; Review
              </button>
            )
          ) : (
            <p className="muted small">Reviews unlock once the order is delivered.</p>
          )}
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
      {reviewOpen && (
        <ReviewModal
          order={order}
          counterPartyName={
            (order.buyer?.id === user?.id ? order.seller?.display_name : order.buyer?.display_name)
            ?? "this order"
          }
          onClose={() => setReviewOpen(false)}
          onSubmit={submitReview}
        />
      )}
    </div>
  );
}
