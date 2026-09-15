import { useEffect, useState } from "react";

import { ApiError } from "../api/client.js";
import { formatPrice } from "../data/listings.js";
import { auctionCheckout, createAddress, listAddresses, myOrders } from "../api/checkout.js";
import { fetchListing } from "../api/catalog.js";
import { useAuth } from "../auth/AuthContext.jsx";
import AddressPicker from "../components/checkout/AddressPicker.jsx";
import CheckoutSteps from "../components/checkout/CheckoutSteps.jsx";
import CheckoutSummary from "../components/checkout/CheckoutSummary.jsx";
import StatusPill from "../components/checkout/StatusPill.jsx";

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
    <div className="content co-page">
      <a className="back-link" href="#/">← Back</a>
      <CheckoutSteps steps={STEPS} current={0} />
      <h1>Auction Winner Checkout</h1>
      {resultState.loading && <p className="muted" role="status">Loading checkout…</p>}
      {resultState.error && (
        <div className="empty-state" role="alert">
          <p>{resultState.error}</p>
          <a className="btn btn-primary" href="#/">Back to marketplace</a>
        </div>
      )}
      {result && (
        <form onSubmit={submit} className="co-layout">
          <div className="co-main">
            <section className="co-card" aria-labelledby="co-win-heading">
              <h2 id="co-win-heading">Winning bid</h2>
              <div className="co-item">
                <span className="co-thumb" aria-hidden="true">
                  {(listing?.title ?? "A").charAt(0).toUpperCase()}
                </span>
                <div className="co-item-text">
                  <p className="co-item-title">{listing?.title ?? "…"}</p>
                  <p className="muted small">
                    Won from {listing?.seller?.display_name ?? "Seller"}
                  </p>
                </div>
              </div>
              <p className="co-offer-price">
                <span>Winning bid</span>
                <strong>{formatPrice(subtotal)}</strong>
              </p>
              {result.checkout_expires_at && result.status === "AWAITING_CHECKOUT" && (
                <p className={expired ? "form-error" : "muted"} role={expired ? "alert" : undefined}>
                  Checkout until {formatDateTime(result.checkout_expires_at)}
                  {" · "}
                  {expired ? "expired" : countdownText(result.checkout_expires_at)}
                </p>
              )}
              {existingOrderId && (
                <p className="form-ok" role="status">
                  An order already exists for this win.{" "}
                  <a href={`#/checkout/payment/${existingOrderId}`}>Continue to payment</a>
                </p>
              )}
              <label className="field">
                <span>
                  Contact email <span className="req" aria-hidden="true">*</span>
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </label>
            </section>
            <AddressPicker
              addresses={addresses}
              addressId={addressId}
              onSelect={setAddressId}
              showNew={showNewAddress}
              onToggleNew={() => setShowNewAddress((v) => !v)}
              newAddress={newAddress}
              onNewChange={(key, value) => setNewAddress((prev) => ({ ...prev, [key]: value }))}
              busy={busy}
              onSave={addAddress}
            />
          </div>
          <CheckoutSummary
            eyebrow="Auction win"
            title={listing?.title ?? "Winning bid"}
            sourcePill={<StatusPill status={result.status} />}
            rows={[
              { label: "Winning bid", value: formatPrice(subtotal), strong: true },
              { label: "Shipping", value: `${formatPrice(shipping)} (server-calculated)` },
            ]}
            totalLabel="Total"
            totalMinor={subtotal + shipping}
            error={error}
            busy={busy}
            submitDisabled={!addressId || expired || result.status !== "AWAITING_CHECKOUT"}
            submitLabel={`Place order · ${formatPrice(subtotal + shipping)}`}
            note="Winner, price, and total come from the server. Double-clicks create one order."
          />
        </form>
      )}
    </div>
  );
}
