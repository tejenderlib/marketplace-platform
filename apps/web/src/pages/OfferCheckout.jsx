import { useCallback, useEffect, useState } from "react";

import { ApiError } from "../api/client.js";
import { formatPrice } from "../data/listings.js";
import { createAddress, listAddresses, myOrders, offerCheckout } from "../api/checkout.js";
import { getOffer } from "../api/offers.js";
import { useAuth } from "../auth/AuthContext.jsx";
import AddressPicker from "../components/checkout/AddressPicker.jsx";
import CheckoutSteps from "../components/checkout/CheckoutSteps.jsx";
import CheckoutSummary from "../components/checkout/CheckoutSummary.jsx";
import StatusPill from "../components/checkout/StatusPill.jsx";

const STEPS = ["Details", "Address", "Review"];

export default function OfferCheckoutPage({ offerId }) {
  const { isAuthenticated, authFetch, redirectToLogin, user } = useAuth();
  const [offerState, setOfferState] = useState({ loading: true, error: null, data: null });
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
  const [existingOrderId, setExistingOrderId] = useState(null);

  useEffect(() => {
    if (!isAuthenticated) {
      redirectToLogin();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const loadOffer = useCallback(async () => {
    setOfferState({ loading: true, error: null, data: null });
    setExistingOrderId(null);
    try {
      const offer = await getOffer(authFetch, offerId);
      setOfferState({ loading: false, error: null, data: offer });
      const mine = await myOrders(authFetch, { limit: 100, offset: 0 });
      const mineForOffer = (mine.items ?? []).find((o) => o.accepted_offer_id === offerId);
      if (mineForOffer) setExistingOrderId(mineForOffer.id);
    } catch (err) {
      setOfferState({
        loading: false,
        error: err instanceof ApiError
          ? `Could not load offer (${err.status}).`
          : "Network error.",
        data: null,
      });
    }
  }, [authFetch, offerId]);

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
    loadOffer();
    if (isAuthenticated) {
      setEmail(user?.email ?? "");
      loadAddresses();
    }
  }, [loadOffer, loadAddresses, isAuthenticated, user]);

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
      const order = await offerCheckout(authFetch, {
        offer_id: offerId,
        contact_email: email.trim(),
        address_id: addressId,
      });
      window.location.hash = `#/checkout/payment/${order.id}`;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Possibly already created (double-click race): resolve to the existing order.
        try {
          const mine = await myOrders(authFetch, { limit: 100, offset: 0 });
          const mineForOffer = (mine.items ?? []).find((o) => o.accepted_offer_id === offerId);
          if (mineForOffer) {
            window.location.hash = `#/checkout/payment/${mineForOffer.id}`;
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

  const offer = offerState.data;
  const canCheckout = offer && offer.status === "ACCEPTED";
  const subtotal = offer?.amount_minor ?? 0;
  const shipping = 0;
  const total = subtotal + shipping;

  return (
    <div className="content co-page">
      <a className="back-link" href="#/offers">
        ← Back
      </a>
      <CheckoutSteps steps={STEPS} current={0} />
      <h1>Accepted Offer Checkout</h1>
      {offerState.loading && <p className="muted" role="status">Loading offer…</p>}
      {offerState.error && (
        <div className="empty-state" role="alert">
          <p>{offerState.error}</p>
          <a className="btn btn-primary" href="#/offers">Back to my offers</a>
        </div>
      )}
      {offer && (
        <form onSubmit={submit} className="co-layout">
          <div className="co-main">
            <section className="co-card" aria-labelledby="co-offer-heading">
              <h2 id="co-offer-heading">Accepted offer</h2>
              <div className="co-item">
                <span className="co-thumb" aria-hidden="true">
                  {(offer.listing?.title ?? "L").charAt(0).toUpperCase()}
                </span>
                <div className="co-item-text">
                  <p className="co-item-title">
                    <a href={`#/listing/${offer.listing_id}`}>{offer.listing?.title ?? "Listing"}</a>
                  </p>
                  <p className="muted small">
                    Negotiated with {offer.seller?.display_name ?? "Seller"}
                  </p>
                </div>
              </div>
              <p className="co-offer-price">
                <span>Negotiated price</span>
                <strong>{formatPrice(offer.amount_minor)}</strong>
              </p>
              {existingOrderId && (
                <p className="form-ok" role="status">
                  An order already exists for this offer.{" "}
                  <a href={`#/checkout/payment/${existingOrderId}`}>Continue to payment</a>
                </p>
              )}
              {!canCheckout && offer.status !== "ACCEPTED" && (
                <p className="form-error" role="alert">
                  Only ACCEPTED offers can be checked out (this offer is {offer.status}).
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
                  disabled={!canCheckout}
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
              lockSelection={!canCheckout}
              onSave={addAddress}
            />
          </div>
          <CheckoutSummary
            eyebrow="Accepted offer"
            title={offer.listing?.title ?? "Listing"}
            titleHref={`#/listing/${offer.listing_id}`}
            sourcePill={<StatusPill status={offer.status} />}
            rows={[
              { label: "Negotiated price", value: formatPrice(offer.amount_minor), strong: true },
              { label: "Shipping", value: `${formatPrice(shipping)} (server-calculated)` },
            ]}
            totalLabel="Total"
            totalMinor={total}
            error={error}
            busy={busy}
            submitDisabled={!addressId || !canCheckout}
            submitLabel={`Place order · ${formatPrice(total)}`}
            note="Negotiated price and total come from the server. Double-clicks create one order."
          />
        </form>
      )}
    </div>
  );
}