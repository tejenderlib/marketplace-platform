import { useCallback, useEffect, useState } from "react";

import { ApiError } from "../api/client.js";
import { formatPrice } from "../data/listings.js";
import { createAddress, fixedPriceCheckout, listAddresses } from "../api/checkout.js";
import { fetchListing } from "../api/catalog.js";
import { useAuth } from "../auth/AuthContext.jsx";
import AddressPicker from "../components/checkout/AddressPicker.jsx";
import CheckoutSteps from "../components/checkout/CheckoutSteps.jsx";
import CheckoutSummary from "../components/checkout/CheckoutSummary.jsx";

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
    <div className="content co-page">
      <a className="back-link" href={listing ? `#/listing/${listing.id}` : "#/"}>
        ← Back
      </a>
      <CheckoutSteps steps={STEPS} current={0} />
      <h1>Checkout</h1>
      {listingState.loading && <p className="muted" role="status">Loading listing…</p>}
      {listingState.error && (
        <div className="empty-state" role="alert">
          <p>{listingState.error}</p>
          <button type="button" className="btn btn-primary" onClick={loadListing}>Retry</button>
        </div>
      )}
      {listing && (
        <form onSubmit={submit} className="co-layout">
          <div className="co-main">
            <section className="co-card" aria-labelledby="co-item-heading">
              <h2 id="co-item-heading">Item</h2>
              <div className="co-item">
                <span className="co-thumb" aria-hidden="true">
                  {listing.title.charAt(0).toUpperCase()}
                </span>
                <div className="co-item-text">
                  <p className="co-item-title">{listing.title}</p>
                  <p className="muted small">
                    {listing.seller?.display_name ?? "Seller"}
                    {" · "}
                    {[listing.city, listing.region].filter(Boolean).join(", ")}
                  </p>
                </div>
              </div>
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
            eyebrow="Fixed price"
            title={listing.title}
            titleHref={`#/listing/${listing.id}`}
            rows={[
              { label: "Price", value: formatPrice(listing.fixed_price_minor) },
              { label: "Shipping", value: `${formatPrice(shipping)} (server-calculated)` },
            ]}
            totalLabel="Total"
            totalMinor={total}
            error={error}
            busy={busy}
            submitDisabled={!addressId}
            submitLabel={`Place order · ${formatPrice(total)}`}
            note="Price and total come from the server. Double-clicks create one order."
          />
        </form>
      )}
    </div>
  );
}
