import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "../api/client.js";
import { formatPrice } from "../data/listings.js";
import { getOrder, payOrder } from "../api/checkout.js";
import { useAuth } from "../auth/AuthContext.jsx";

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
    <div className="content">
      <a className="back-link" href={order ? `#/orders/${order.id}` : "#/orders"}>
        ← {order ? "Order details" : "My orders"}
      </a>
      <ol className="steps" aria-label="Checkout progress">
        {STEPS.map((label, i) => (
          <li key={label} className={i === 3 ? "step current" : "step done"}>
            <span>{i + 1}. {label}</span>
          </li>
        ))}
      </ol>
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
        <div className="detail-grid">
          <div className="detail-card">
            <h2>Order summary</h2>
            <dl className="kv">
              <dt>Item</dt><dd>{order.listing_title_snapshot}</dd>
              <dt>Subtotal</dt><dd>{formatPrice(order.subtotal_minor)}</dd>
              <dt>Shipping</dt><dd>{formatPrice(order.shipping_minor)}</dd>
              <dt>Total</dt><dd><strong>{formatPrice(order.total_minor)}</strong></dd>
              <dt>Status</dt><dd><span className="pill">{order.status}</span></dd>
            </dl>
          </div>
          <div className="detail-card">
            <h2>Dummy payment</h2>
            {paid ? (
              <>
                <p className="form-ok" role="status">
                  Paid {formatPrice(order.total_minor)}. Order {order.id.slice(0, 8)}… is confirmed.
                </p>
                <a className="btn btn-primary" href={`#/orders/${order.id}`}>
                  View order
                </a>
              </>
            ) : (
              <>
                <label>
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
                  className="btn btn-primary btn-block"
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
          </div>
        </div>
      )}
    </div>
  );
}
