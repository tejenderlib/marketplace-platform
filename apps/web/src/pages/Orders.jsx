import { useCallback, useEffect, useState } from "react";

import { ApiError } from "../api/client.js";
import { formatPrice } from "../data/listings.js";
import { getOrder, myOrders } from "../api/checkout.js";
import { createReview } from "../api/reviews.js";
import { useAuth } from "../auth/AuthContext.jsx";
import OrderTimeline from "../components/checkout/OrderTimeline.jsx";
import Pill from "../components/ui/Pill.jsx";
import StatusPill from "../components/checkout/StatusPill.jsx";
import Button from "../components/ui/Button.jsx";
import ReviewModal from "../components/ReviewModal.jsx";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/States.jsx";
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
      <div className="ce-stack">
        <p className="ce-small ce-muted">Redirecting to login…</p>
      </div>
    );
  }

  const page = Math.floor(offset / LIMIT) + 1;
  const pages = Math.max(1, Math.ceil(state.total / LIMIT));

  return (
    <div className="ce-stack">
      <div>
        <p className="ce-micro ce-muted">Purchase history</p>
        <h1 className="ce-h1">My Orders</h1>
      </div>
      {reviewNote && (
        <p className="ce-ok" role="status">
          {reviewNote}
        </p>
      )}
      {state.loading && <LoadingState label="Loading orders…" />}
      {state.error && (
        <ErrorState message={state.error} onRetry={load} />
      )}
      {!state.loading && !state.error && state.items.length === 0 && (
        <EmptyState
          title="No orders yet"
          hint="Your completed checkouts will appear here."
          action={<Button variant="secondary" size="sm" href="#/">Browse listings</Button>}
        />
      )}
      {!state.error && state.items.length > 0 && (
        <>
          <ul className="ce-order-list">
            {state.items.map((order) => (
              <li key={order.id} className="ce-order-card">
                <span className="ce-thumb" aria-hidden="true">
                  {(order.listing_title_snapshot ?? "?").charAt(0).toUpperCase()}
                </span>
                <div>
                  <p className="ce-item-title">
                    <a href={`#/orders/${order.id}`}>{order.listing_title_snapshot}</a>
                  </p>
                  <p className="ce-small ce-muted">
                    {sourceLabel(order.source)}
                    {" · "}
                    {order.seller?.display_name ?? "—"}
                    {" · "}
                    {formatDateTime(order.created_at)}
                  </p>
                  <p>
                    <StatusPill status={order.status} />
                  </p>
                </div>
                <p className="ce-order-total ce-tnum">{formatPrice(order.total_minor)}</p>
                <div className="ce-order-action">
                  {order.status === "DELIVERED" ? (
                    reviewedIds.has(order.id) ? (
                      <Pill status="PAYMENT_COMPLETED">Reviewed</Pill>
                    ) : (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => {
                          setReviewNote(null);
                          setReviewTarget(order);
                        }}
                      >
                        Rate &amp; Review
                      </Button>
                    )
                  ) : (order.status === "PENDING_PAYMENT" || order.status === "PAYMENT_FAILED") ? (
                    <Button variant="secondary" size="sm" href={`#/checkout/payment/${order.id}`}>
                      Pay now
                    </Button>
                  ) : (
                    <span className="ce-small ce-muted">—</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <div className="ce-pagination">
            <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setOffset(offset - LIMIT)} aria-label="Previous page">
              ← Prev
            </Button>
            <span className="ce-small ce-muted ce-tnum" aria-live="polite">Page {page} of {pages}</span>
            <Button variant="ghost" size="sm" disabled={page >= pages} onClick={() => setOffset(offset + LIMIT)} aria-label="Next page">
              Next →
            </Button>
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
      <div className="ce-stack">
        <p className="ce-small ce-muted">Redirecting to login…</p>
      </div>
    );
  }
  if (state.loading) return <div className="ce-stack"><LoadingState label="Loading order…" /></div>;
  if (state.error) {
    return (
      <div className="ce-stack">
        <ErrorState message={state.error} onRetry={load} />
      </div>
    );
  }
  if (!state.order) return <div className="ce-stack"><p className="ce-small ce-muted">Order not found.</p></div>;

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
    <div className="ce-stack">
      <div>
        <a className="ce-back" href="#/orders">← My orders</a>
        <div className="ce-order-head">
          <div>
            <p className="ce-micro ce-muted">
              Order {order.id.slice(0, 8)}… · {sourceLabel(order.source)}
            </p>
            <h1 className="ce-h1">{order.listing_title_snapshot}</h1>
          </div>
          <StatusPill status={order.status} />
        </div>
        <p className="ce-small ce-muted">Ordered {formatDateTime(order.created_at)}</p>
      </div>
      <div className="ce-co-grid">
        <div className="ce-co-main">
          <section className="ce-card" aria-labelledby="od-summary-heading">
            <h2 id="od-summary-heading">Summary</h2>
            <div className="ce-item">
              <span className="ce-thumb" aria-hidden="true">
                {(order.listing_title_snapshot ?? "?").charAt(0).toUpperCase()}
              </span>
              <div>
                <p className="ce-item-title">
                  <a href={`#/listing/${order.listing_id}`}>{order.listing_title_snapshot}</a>
                </p>
                <p className="ce-small ce-muted">
                  Buyer: {order.buyer?.display_name ?? "—"}
                  {" · "}
                  Seller: {order.seller?.display_name ?? "—"}
                </p>
              </div>
            </div>
            <dl className="ce-lines">
              <div>
                <dt>Subtotal</dt>
                <dd>{formatPrice(order.subtotal_minor)}</dd>
              </div>
              <div>
                <dt>Shipping</dt>
                <dd>{formatPrice(order.shipping_minor)}</dd>
              </div>
            </dl>
            <p className="ce-total">
              <span>Total</span>
              <strong className="ce-tnum">{formatPrice(order.total_minor)}</strong>
            </p>
            {order.paid_at && (
              <p className="ce-small ce-muted">Paid {formatDateTime(order.paid_at)}</p>
            )}
          </section>

          <section className="ce-card" aria-labelledby="od-payments-heading">
            <h2 id="od-payments-heading">Payments</h2>
            {order.payments.length === 0 && <p className="ce-small ce-muted">No payment attempts yet.</p>}
            {order.payments.map((pay) => (
              <dl className="ce-lines" key={pay.id}>
                <div>
                  <dt>Amount</dt>
                  <dd>{formatPrice(pay.amount_minor)}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd><StatusPill status={pay.status} /></dd>
                </div>
                <div>
                  <dt>Provider</dt>
                  <dd>{pay.provider}</dd>
                </div>
                {pay.failure_message && (
                  <div>
                    <dt>Failure</dt>
                    <dd>{pay.failure_message}</dd>
                  </div>
                )}
              </dl>
            ))}
            {order.status === "PENDING_PAYMENT" || order.status === "PAYMENT_FAILED" ? (
              <div>
                <Button variant="primary" href={`#/checkout/payment/${order.id}`}>
                  Continue to payment
                </Button>
              </div>
            ) : null}
          </section>

          <section className="ce-card" aria-labelledby="od-review-heading">
            <h2 id="od-review-heading">Review</h2>
            {reviewNote ? (
              <p className="ce-ok" role="status">{reviewNote}</p>
            ) : order.status === "DELIVERED" ? (
              reviewed ? (
                <p className="ce-small ce-muted">You have reviewed this order.</p>
              ) : (
                <Button variant="primary" onClick={() => setReviewOpen(true)}>
                  Rate &amp; Review
                </Button>
              )
            ) : (
              <p className="ce-small ce-muted">Reviews unlock once the order is delivered.</p>
            )}
          </section>
        </div>

        <div className="ce-co-main">
          <section className="ce-card" aria-labelledby="od-address-heading">
            <h2 id="od-address-heading">Delivery address</h2>
            {snap ? (
              <dl className="ce-facts">
                <div>
                  <dt>Recipient</dt>
                  <dd>{snap.recipient_name}</dd>
                </div>
                <div>
                  <dt>Address</dt>
                  <dd>{[snap.line1, snap.line2].filter(Boolean).join(", ")}</dd>
                </div>
                <div>
                  <dt>City</dt>
                  <dd>{[snap.city, snap.region].filter(Boolean).join(", ")}</dd>
                </div>
                <div>
                  <dt>Country</dt>
                  <dd>{snap.country}</dd>
                </div>
                <div>
                  <dt>Contact</dt>
                  <dd>{order.contact_email_normalized}</dd>
                </div>
              </dl>
            ) : (
              <p className="ce-small ce-muted">No snapshot on file.</p>
            )}
            <div>
              <Button variant="ghost" block href={`#/listing/${order.listing_id}`}>
                View listing
              </Button>
            </div>
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
