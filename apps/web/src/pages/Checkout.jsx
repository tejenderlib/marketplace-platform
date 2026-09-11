import { useCallback, useEffect, useState } from "react";

import { ApiError } from "../api/client.js";
import { formatPrice } from "../data/listings.js";
import { createAddress, fixedPriceCheckout, listAddresses } from "../api/checkout.js";
import { fetchListing } from "../api/catalog.js";
import { useAuth } from "../auth/AuthContext.jsx";

const STEPS = ["Details", "Address", "Review"];

export default function CheckoutPage({ listingId }) {
  const { isAuthenticated, authFetch, redirectToLogin, user } = useAuth();
  const [listingState, setListingState] = useState({ loading: true, error: null, data: null });
  const [addresses, setAddresses] = useState({ loading: true, error: null, items: [] });
  const [email, setEmail] = useState("");
  const [addressId, setAddressId] = useState("");
  const [showNewAddress, setShowNewAddress] = useState(false);
  const [newAddress, setNewAddress] = useState({
    recipient_name: "", line1: "", line2: "", city: "", region: "",
    postal_code: "", country: "IN", phone: "", is_default: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isAuthenticated) {
      redirectToLogin();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const loadListing = useCallback(async () => {
    setListingState({ loading: true, error: null, data: null });
    try {
      const data = await fetchListing(listingId);
      setListingState({ loading: false, error: null, data });
    } catch (err) {
      setListingState({
        loading: false,
        error: err instanceof ApiError ? `Could not load listing (${err.status}).` : "Network error.",
        data: null,
      });
    }
  }, [listingId]);

  const loadAddresses = useCallback(async () => {
    setAddresses({ loading: true, error: null, items: [] });
    try {
      const items = await listAddresses(authFetch);
      setAddresses({ loading: false, error: null, items });
      const def = items.find((a) => a.is_default) ?? items[0];
      if (def) setAddressId(def.id);
    } catch {
      setAddresses({ loading: false, error: "Could not load addresses.", items: [] });
    }
  }, [authFetch]);

  useEffect(() => {
    loadListing();
    if (isAuthenticated) {
      setEmail(user?.email ?? "");
      loadAddresses();
    }
  }, [loadListing, loadAddresses, isAuthenticated, user]);

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
        label: newAddress.label || null,
      });
      setNewAddress({
        recipient_name: "", line1: "", line2: "", city: "", region: "",
        postal_code: "", country: "IN", phone: "", is_default: false,
      });
      setShowNewAddress(false);
      await loadAddresses();
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
      const order = await fixedPriceCheckout(authFetch, {
        listing_id: listingId,
        contact_email: email.trim(),
        address_id: addressId,
      });
      window.location.hash = `#/checkout/payment/${order.id}`;
    } catch (err) {
      setError(err instanceof ApiError ? `Checkout failed (${err.status}): ${err.message}` : "Network error.");
    } finally {
      setBusy(false);
    }
  }

  const listing = listingState.data;
  const subtotal = listing?.fixed_price_minor ?? 0;
  const shipping = 0;
  const total = subtotal + shipping;
  const selectedAddress = addresses.items.find((a) => a.id === addressId);

  return (
    <div className="content">
      <a className="back-link" href={listing ? `#/listing/${listing.id}` : "#/"}>
        ← Back
      </a>
      <ol className="steps" aria-label="Checkout progress">
        {STEPS.map((label, i) => (
          <li key={label} className={i === 0 ? "step current" : "step"}>
            <span>{i + 1}. {label}</span>
          </li>
        ))}
      </ol>
      <h1>Checkout</h1>
      {listingState.loading && <p className="muted" role="status">Loading listing…</p>}
      {listingState.error && (
        <div className="empty-state" role="alert">
          <p>{listingState.error}</p>
          <button type="button" className="btn btn-primary" onClick={loadListing}>Retry</button>
        </div>
      )}
      {listing && (
        <form onSubmit={submit}>
          <div className="detail-grid">
            <div className="detail-card">
              <h2>Item</h2>
              <dl className="kv">
                <dt>Title</dt><dd>{listing.title}</dd>
                <dt>Price</dt><dd>{formatPrice(listing.fixed_price_minor)}</dd>
                <dt>Shipping</dt><dd>{formatPrice(shipping)} (server-calculated)</dd>
                <dt>Total</dt><dd><strong>{formatPrice(total)}</strong></dd>
                <dt>Seller</dt><dd>{listing.seller?.display_name ?? "Seller"}</dd>
                <dt>Location</dt><dd>{[listing.city, listing.region].filter(Boolean).join(", ")}</dd>
              </dl>
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
          <button type="submit" className="btn btn-primary btn-block" disabled={busy || !addressId}>
            {busy ? "Placing order…" : `Place order · ${formatPrice(total)}`}
          </button>
          <p className="muted small">Price and total come from the server. Double-clicks create one order.</p>
        </form>
      )}
    </div>
  );
}
