import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "../api/client.js";
import { formatPrice } from "../data/listings.js";
import { getOrder, payOrder } from "../api/checkout.js";
import { useAuth } from "../auth/AuthContext.jsx";
import CheckoutSteps from "../components/checkout/CheckoutSteps.jsx";
import StatusPill from "../components/checkout/StatusPill.jsx";

function newKey() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const STEPS = ["Details", "Address", "Review", "Payment"];

export default function PaymentPage({ orderId }) {
  const { isAuthenticated, authFetch, redirectToLogin } = useAuth();
  const [state, setState] = useState({ loading: true, error: null, order: null });
  const [simulate, setSimulate] = useState("success");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const keyRef = useRef(newKey());

  useEffect(() => {
    if (!isAuthenticated) {
      redirectToLogin();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const load = useCallback(async () => {
    setState({ loading: true, error: null, order: null });
    try {
      const order = await getOrder(authFetch, orderId);
      setState({ loading: false, error: null, order });
    } catch (err) {
      setState({
        loading: false,
        error: err instanceof ApiError ? `Could not load order (${err.status}).` : "Network error.",
        order: null,
      });
    }
  }, [authFetch, orderId]);

  useEffect(() => {
    if (isAuthenticated) load();
  }, [isAuthenticated, load]);

  if (!isAuthenticated) {
    return (
      <div className="content">
        <p className="muted">Redirecting to login…</p>
      </div>
    );
  }

  async function pay() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await payOrder(authFetch, orderId, {
        idempotency_key: keyRef.current,
        simulate,
      });
      setResult(response);
    } catch (err) {
      setError(err instanceof ApiError ? `Payment failed (${err.status}): ${err.message}` : "Network error.");
    } finally {
      setBusy(false);
    }
  }

  function retry() {
    keyRef.current = newKey();
    pay();
  }

  const order = result?.order ?? state.order;
  const payment = result?.payment ?? null;
  const paid = order?.status === "PAID";
  const failed = payment?.status === "FAILED" || order?.status === "PAYMENT_FAILED";

  return (
    <div className="content co-page">
      <a className="back-link" href={order ? `#/orders/${order.id}` : "#/orders"}>
        ← {order ? "Order details" : "My orders"}
      </a>
      <CheckoutSteps steps={STEPS} current={3} />
      <h1>Payment</h1>
      <p className="muted">
        Test payment only — the dummy provider settles locally. No real money moves.
      </p>
      {state.loading && <p className="muted" role="status">Loading order…</p>}
      {state.error && (
        <div className="empty-state" role="alert">
          <p>{state.error}</p>
          <button type="button" className="btn btn-primary" onClick={load}>Retry</button>
        </div>
      )}
      {order && (
        <div className="co-layout">
          <div className="co-main">
            <section className="co-card" aria-labelledby="co-pay-heading">
              <h2 id="co-pay-heading">Dummy payment</h2>
              {paid ? (
                <>
                  <p className="form-ok" role="status">
                    Paid {formatPrice(order.total_minor)}. Order {order.id.slice(0, 8)}… is confirmed.
                  </p>
                  <a className="btn btn-bid" href={`#/orders/${order.id}`}>
                    View order
                  </a>
                </>
              ) : (
                <>
                  <label className="field">
                    <span>Simulated outcome</span>
                    <select value={simulate} onChange={(e) => setSimulate(e.target.value)} disabled={busy}>
                      <option value="success">Succeed (test)</option>
                      <option value="failure">Decline (test)</option>
                    </select>
                  </label>
                  {failed && (
                    <p className="form-error" role="alert">
                      Last attempt was declined{payment?.failure_message ? `: ${payment.failure_message}` : "."}{" "}
                      Retry uses a fresh idempotency key; the order is untouched otherwise.
                    </p>
                  )}
                  {error && (
                    <p className="form-error" role="alert">
                      {error}
                    </p>
                  )}
                  <button
                    type="button"
                    className="btn btn-bid"
                    disabled={busy}
                    onClick={failed ? retry : pay}
                  >
                    {busy ? "Processing…" : failed ? `Retry · ${formatPrice(order.total_minor)}` : `Pay ${formatPrice(order.total_minor)}`}
                  </button>
                  <p className="muted small">
                    One click = one idempotency key. Re-clicks and retries are safe: repeats return the
                    same payment record.
                  </p>
                </>
              )}
            </section>
          </div>
          <aside className="co-summary" aria-label="Order summary">
            <div className="co-summary-card">
              <p className="co-eyebrow">Order</p>
              <h2 className="co-title">{order.listing_title_snapshot}</h2>
              <StatusPill status={order.status} />
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
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
