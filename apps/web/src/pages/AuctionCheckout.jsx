import { useEffect, useState } from "react";

import { ApiError } from "../api/client.js";
import { formatPrice } from "../data/listings.js";
import { auctionCheckout, createAddress, listAddresses, myOrders } from "../api/checkout.js";
import { fetchListing } from "../api/catalog.js";
import { useAuth } from "../auth/AuthContext.jsx";

function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function countdownText(target) {
  const ms = new Date(target).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return "expired";
  const total = Math.floor(ms / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${minutes}m left`;
}

const STEPS = ["Details", "Address", "Review"];

export default function AuctionCheckoutPage({ resultId }) {
  const { isAuthenticated, authFetch, redirectToLogin, user } = useAuth();
  const [resultState, setResultState] = useState({ loading: true, error: null, data: null });
  const [listing, setListing] = useState(null);
  const [auction, setAuction] = useState(null);
  const [addresses, setAddresses] = useState({ loading: true, error: null, items: [] });
  const [email, setEmail] = useState("");
  const [addressId, setAddressId] = useState("");
  const [showNewAddress, setShowNewAddress] = useState(false);
  const [newAddress, setNewAddress] = useState({
    recipient_name: "", line1: "", line2: "", city: "", region: "",
    postal_code: "", country: "IN", phone: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [existingOrderId, setExistingOrderId] = useState(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!isAuthenticated) {
      redirectToLogin();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!isAuthenticated) return;
      setResultState({ loading: true, error: null, data: null });
      setExistingOrderId(null);
      try {
        // No direct result-by-id endpoint exists, so resolve through the
        // auction index (single bounded scan) and match the result id.
        const auctions = await authFetch(`/auctions?limit=100&offset=0`).catch(() => null);
        let found = null;
        let foundAuction = null;
        if (auctions) {
          for (const item of auctions.items ?? []) {
            try {
              // eslint-disable-next-line no-await-in-loop
              const r = await authFetch(`/auctions/${item.id}/result`);
              if (r && r.id === resultId) {
                found = r;
                foundAuction = item;
                break;
              }
            } catch (err) {
              if (!(err instanceof ApiError) || err.status !== 404) throw err;
            }
          }
        }
        if (!alive) return;
        if (!found) {
          setResultState({ loading: false, error: "Not available — this result does not exist, is not visible to you, or was already checked out. Only the winning bidder can use this page.", data: null });
          return;
        }
        setResultState({ loading: false, error: null, data: found });
        setAuction(foundAuction);
        const det = await fetchListing(foundAuction.listing_id);
        if (!alive) return;
        setListing(det);
        const mine = await myOrders(authFetch, { limit: 100, offset: 0 });
        if (!alive) return;
        const mineForResult = (mine.items ?? []).find((o) => o.auction_result_id === resultId);
        if (mineForResult) setExistingOrderId(mineForResult.id);
        const addrs = await listAddresses(authFetch);
        if (!alive) return;
        setAddresses({ loading: false, error: null, items: addrs });
        const def = addrs.find((a) => a.is_default) ?? addrs[0];
        if (def) setAddressId(def.id);
        setEmail(user?.email ?? "");
      } catch (err) {
        if (!alive) return;
        setResultState({
          loading: false,
          error: err instanceof ApiError ? `Could not load checkout (${err.status}).` : "Network error.",
          data: null,
        });
      }
    })();
    return () => {
      alive = false;
    };
  }, [isAuthenticated, authFetch, resultId, user]);

  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!isAuthenticated) {
    return (
      <div className="content">
        <p className="muted">Redirecting to login…</p>
      </div>
    );
  }

  async function addAddress(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await createAddress(authFetch, {
        ...newAddress,
        line2: newAddress.line2 || null,
        region: newAddress.region || null,
        postal_code: newAddress.postal_code || null,
        phone: newAddress.phone || null,
      });
      setNewAddress({
        recipient_name: "", line1: "", line2: "", city: "", region: "",
        postal_code: "", country: "IN", phone: "",
      });
      setShowNewAddress(false);
      const items = await listAddresses(authFetch);
      setAddresses({ loading: false, error: null, items });
      setAddressId(created.id);
    } catch (err) {
      setError(err instanceof ApiError ? `Could not save address (${err.status}): ${err.message}` : "Network error.");
    } finally {
      setBusy(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    if (!addressId) {
      setError("Select a delivery address.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const order = await auctionCheckout(authFetch, {
        auction_result_id: resultId,
        contact_email: email.trim(),
        address_id: addressId,
      });
      window.location.hash = `#/checkout/payment/${order.id}`;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Possibly already created (double-click race): resolve to the existing order.
        try {
          const mine = await myOrders(authFetch, { limit: 100, offset: 0 });
          const mineForResult = (mine.items ?? []).find((o) => o.auction_result_id === resultId);
          if (mineForResult) {
            window.location.hash = `#/checkout/payment/${mineForResult.id}`;
            return;
          }
        } catch {
          /* fall through to error display */
        }
      }
      setError(err instanceof ApiError ? `Checkout failed (${err.status}): ${err.message}` : "Network error.");
    } finally {
      setBusy(false);
    }
  }

  const result = resultState.data;
  const expired =
    result &&
    result.status === "AWAITING_CHECKOUT" &&
    result.checkout_expires_at &&
    new Date(result.checkout_expires_at).getTime() <= Date.now();
  const subtotal = result?.final_price_minor ?? 0;
  const shipping = 0;

  return (
    <div className="content">
      <a className="back-link" href="#/">← Back</a>
      <ol className="steps" aria-label="Checkout progress">
        {STEPS.map((label, i) => (
          <li key={label} className={i === 0 ? "step current" : "step"}>
            <span>{i + 1}. {label}</span>
          </li>
        ))}
      </ol>
      <h1>
        Auction Winner Checkout{" "}
        <span className="pill" title="Only the winning bidder can check out">
          Auction Winner
        </span>
      </h1>
      {resultState.loading && <p className="muted" role="status">Loading checkout…</p>}
      {resultState.error && (
        <div className="empty-state" role="alert">
          <p>{resultState.error}</p>
          <a className="btn btn-primary" href="#/">Back to marketplace</a>
        </div>
      )}
      {result && (
        <form onSubmit={submit}>
          <div className="detail-grid">
            <div className="detail-card">
              <h2>Winning bid</h2>
              <dl className="kv">
                <dt>Item</dt><dd>{listing?.title ?? "…"}</dd>
                <dt>Seller</dt><dd>{listing?.seller?.display_name ?? "Seller"}</dd>
                <dt>Final price</dt><dd>{formatPrice(subtotal)}</dd>
                <dt>Shipping</dt><dd>{formatPrice(shipping)} (server-calculated)</dd>
                <dt>Total</dt><dd><strong>{formatPrice(subtotal + shipping)}</strong></dd>
                <dt>Status</dt><dd><span className="pill">{result.status}</span></dd>
                {result.checkout_expires_at && result.status === "AWAITING_CHECKOUT" && (
                  <>
                    <dt>Checkout until</dt><dd>{formatDateTime(result.checkout_expires_at)}</dd>
                    <dt>Remaining</dt><dd>{expired ? "expired" : countdownText(result.checkout_expires_at)}</dd>
                  </>
                )}
              </dl>
              {existingOrderId && (
                <p className="form-ok" role="status">
                  An order already exists for this win.{" "}
                  <a href={`#/checkout/payment/${existingOrderId}`}>Continue to payment</a>
                </p>
              )}
              {expired && (
                <p className="form-error" role="alert">
                  The checkout window has expired. The backend decides expiry authoritatively.
                </p>
              )}
              <label>
                <span>Contact email</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </label>
            </div>
            <div className="detail-card">
              <h2>Delivery address</h2>
              {addresses.loading && <p className="muted">Loading addresses…</p>}
              {addresses.error && <p className="form-error">{addresses.error}</p>}
              {!addresses.loading && addresses.items.length === 0 && !showNewAddress && (
                <p className="muted">No saved addresses yet — add one below.</p>
              )}
              {addresses.items.map((addr) => (
                <label key={addr.id} className="address-option">
                  <input
                    type="radio"
                    name="address"
                    checked={addressId === addr.id}
                    onChange={() => setAddressId(addr.id)}
                  />
                  <span>
                    <strong>{addr.recipient_name}</strong> — {addr.line1}, {addr.city}
                    {addr.is_default ? " · default" : ""}
                  </span>
                </label>
              ))}
              <button type="button" className="btn btn-ghost" onClick={() => setShowNewAddress((v) => !v)}>
                {showNewAddress ? "Hide new address" : "Add new address"}
              </button>
            </div>
          </div>

          {showNewAddress && (
            <div className="detail-card">
              <h2>New address (India only)</h2>
              <div className="form-grid">
                <label><span>Recipient *</span>
                  <input value={newAddress.recipient_name} onChange={(e) => setNewAddress({ ...newAddress, recipient_name: e.target.value })} required={showNewAddress} />
                </label>
                <label><span>Address line 1 *</span>
                  <input value={newAddress.line1} onChange={(e) => setNewAddress({ ...newAddress, line1: e.target.value })} required={showNewAddress} />
                </label>
                <label><span>City *</span>
                  <input value={newAddress.city} onChange={(e) => setNewAddress({ ...newAddress, city: e.target.value })} required={showNewAddress} />
                </label>
                <label><span>State</span>
                  <input value={newAddress.region} onChange={(e) => setNewAddress({ ...newAddress, region: e.target.value })} />
                </label>
                <label><span>PIN code</span>
                  <input value={newAddress.postal_code} onChange={(e) => setNewAddress({ ...newAddress, postal_code: e.target.value })} inputMode="numeric" />
                </label>
                <label><span>Phone</span>
                  <input value={newAddress.phone} onChange={(e) => setNewAddress({ ...newAddress, phone: e.target.value })} type="tel" />
                </label>
                <label><span>Country</span>
                  <select value={newAddress.country} onChange={(e) => setNewAddress({ ...newAddress, country: e.target.value })}>
                    <option value="IN">India (IN)</option>
                  </select>
                </label>
              </div>
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={addAddress}>
                Save address
              </button>
            </div>
          )}

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={busy || !addressId || expired || result.status !== "AWAITING_CHECKOUT"}
          >
            {busy ? "Placing order…" : `Place order · ${formatPrice(subtotal + shipping)}`}
          </button>
          <p className="muted small">Winner, price, and total come from the server. Double-clicks create one order.</p>
        </form>
      )}
    </div>
  );
}
