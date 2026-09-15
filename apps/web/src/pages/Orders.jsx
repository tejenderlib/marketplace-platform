import { useCallback, useEffect, useState } from "react";

import { ApiError } from "../api/client.js";
import { formatPrice } from "../data/listings.js";
import { getOrder, myOrders } from "../api/checkout.js";
import { createReview } from "../api/reviews.js";
import { useAuth } from "../auth/AuthContext.jsx";
import OrderTimeline from "../components/checkout/OrderTimeline.jsx";
import StatusPill from "../components/checkout/StatusPill.jsx";
import ReviewModal from "../components/ReviewModal.jsx";
import { useReviewedOrders } from "../hooks/useReviewedOrders.js";
import { formatDateTime, sourceLabel } from "../components/checkout/orderDisplay.js";

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
          <ul className="order-list">
            {state.items.map((order) => (
              <li key={order.id} className="order-card">
                <a
                  className="order-thumb"
                  href={`#/orders/${order.id}`}
                  aria-hidden="true"
                  tabIndex={-1}
                >
                  {(order.listing_title_snapshot ?? "?").charAt(0).toUpperCase()}
                </a>
                <div className="order-main">
                  <p className="order-title">
                    <a href={`#/orders/${order.id}`}>{order.listing_title_snapshot}</a>
                  </p>
                  <p className="muted small">
                    {sourceLabel(order.source)}
                    {" · "}
                    {order.seller?.display_name ?? "—"}
                    {" · "}
                    {formatDateTime(order.created_at)}
                  </p>
                  <p className="order-pills">
                    <StatusPill status={order.status} />
                  </p>
                </div>
                <p className="order-total">{formatPrice(order.total_minor)}</p>
                <div className="order-action">
                  {order.status === "DELIVERED" ? (
                    reviewedIds.has(order.id) ? (
                      <span className="pill pill-paid">Reviewed</span>
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
                  ) : (order.status === "PENDING_PAYMENT" || order.status === "PAYMENT_FAILED") ? (
                    <a className="btn btn-ghost btn-sm" href={`#/checkout/payment/${order.id}`}>
                      Pay now
                    </a>
                  ) : (
                    <span className="muted small">—</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <div className="pagination storefront-pagination">
            <button type="button" className="btn btn-ghost" disabled={page <= 1} onClick={() => setOffset(offset - LIMIT)} aria-label="Previous page">
              ← Prev
            </button>
            <span className="pagination-status" aria-live="polite">Page {page} of {pages}</span>
            <button type="button" className="btn btn-ghost" disabled={page >= pages} onClick={() => setOffset(offset + LIMIT)} aria-label="Next page">
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
    <div className="content co-page">
      <a className="back-link" href="#/orders">← My orders</a>
      <div className="order-head">
        <div>
          <p className="co-eyebrow">
            Order {order.id.slice(0, 8)}… · {sourceLabel(order.source)}
          </p>
          <h1 className="order-title-lg">{order.listing_title_snapshot}</h1>
        </div>
        <StatusPill status={order.status} />
      </div>
      <p className="muted small">Ordered {formatDateTime(order.created_at)}</p>
      <div className="co-layout">
        <div className="co-main">
          <section className="co-card" aria-labelledby="od-summary-heading">
            <h2 id="od-summary-heading">Summary</h2>
            <div className="co-item">
              <span className="co-thumb" aria-hidden="true">
                {(order.listing_title_snapshot ?? "?").charAt(0).toUpperCase()}
              </span>
              <div className="co-item-text">
                <p className="co-item-title">
                  <a href={`#/listing/${order.listing_id}`}>{order.listing_title_snapshot}</a>
                </p>
                <p className="muted small">
                  Buyer: {order.buyer?.display_name ?? "—"}
                  {" · "}
                  Seller: {order.seller?.display_name ?? "—"}
                </p>
              </div>
            </div>
            <dl className="kv co-lines">
              <div className="co-line">
                <dt>Subtotal</dt>
                <dd>{formatPrice(order.subtotal_minor)}</dd>
              </div>
              <div className="co-line">
                <dt>Shipping</dt>
                <dd>{formatPrice(order.shipping_minor)}</dd>
              </div>
            </dl>
            <p className="co-total">
              <span>Total</span>
              <strong>{formatPrice(order.total_minor)}</strong>
            </p>
            {order.paid_at && (
              <p className="muted small">Paid {formatDateTime(order.paid_at)}</p>
            )}
          </section>

          <section className="co-card" aria-labelledby="od-payments-heading">
            <h2 id="od-payments-heading">Payments</h2>
            {order.payments.length === 0 && <p className="muted">No payment attempts yet.</p>}
            {order.payments.map((pay) => (
              <dl className="kv co-lines" key={pay.id}>
                <div className="co-line">
                  <dt>Amount</dt>
                  <dd>{formatPrice(pay.amount_minor)}</dd>
                </div>
                <div className="co-line">
                  <dt>Status</dt>
                  <dd><StatusPill status={pay.status} /></dd>
                </div>
                <div className="co-line">
                  <dt>Provider</dt>
                  <dd>{pay.provider}</dd>
                </div>
                {pay.failure_message && (
                  <div className="co-line">
                    <dt>Failure</dt>
                    <dd>{pay.failure_message}</dd>
                  </div>
                )}
              </dl>
            ))}
            {order.status === "PENDING_PAYMENT" || order.status === "PAYMENT_FAILED" ? (
              <a className="btn btn-bid" href={`#/checkout/payment/${order.id}`}>
                Continue to payment
              </a>
            ) : null}
          </section>

          <section className="co-card" aria-labelledby="od-review-heading">
            <h2 id="od-review-heading">Review</h2>
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
          </section>
        </div>

        <div className="co-side">
          <section className="co-card" aria-labelledby="od-address-heading">
            <h2 id="od-address-heading">Delivery address</h2>
            {snap ? (
              <dl className="kv co-lines">
                <div className="co-line">
                  <dt>Recipient</dt>
                  <dd>{snap.recipient_name}</dd>
                </div>
                <div className="co-line">
                  <dt>Address</dt>
                  <dd>{[snap.line1, snap.line2].filter(Boolean).join(", ")}</dd>
                </div>
                <div className="co-line">
                  <dt>City</dt>
                  <dd>{[snap.city, snap.region].filter(Boolean).join(", ")}</dd>
                </div>
                <div className="co-line">
                  <dt>Country</dt>
                  <dd>{snap.country}</dd>
                </div>
                <div className="co-line">
                  <dt>Contact</dt>
                  <dd>{order.contact_email_normalized}</dd>
                </div>
              </dl>
            ) : (
              <p className="muted">No snapshot on file.</p>
            )}
            <a className="btn btn-ghost btn-block" href={`#/listing/${order.listing_id}`}>
              View listing
            </a>
          </section>
          <OrderTimeline order={order} />
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
