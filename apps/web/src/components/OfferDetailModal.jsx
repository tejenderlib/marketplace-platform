import { useEffect, useState } from "react";

import { formatPrice } from "../data/listings.js";

function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

/** Offer detail modal for buyer, seller, or ADMIN (backend enforces visibility). */
export default function OfferDetailModal({ offerId, currentUserId, isAdmin, api, onClose, onChanged }) {
  const [state, setState] = useState({ loading: true, error: null, offer: null });
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  async function load() {
    setState({ loading: true, error: null, offer: null });
    try {
      const offer = await api.getOffer(offerId);
      setState({ loading: false, error: null, offer });
    } catch (err) {
      setState({ loading: false, error: err.message ?? "Could not load the offer.", offer: null });
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offerId]);

  async function act(kind, status) {
    setBusy(kind);
    setError(null);
    try {
      if (kind === "withdraw") {
        await api.withdraw(offerId);
      } else {
        await api.respond(offerId, status);
      }
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.message ?? "Action failed.");
    } finally {
      setBusy(null);
    }
  }

  const offer = state.offer;
  const isBuyer = offer && currentUserId === offer.buyer_id;
  const isSeller = offer && currentUserId === offer.seller?.id;
  const canRespond = offer && offer.status === "PENDING" && (isSeller || isAdmin);
  const canWithdraw = offer && offer.status === "PENDING" && isBuyer;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Offer details">
      <div className="modal">
        <h2>Offer details</h2>
        {state.loading && <p className="muted" role="status">Loading offer…</p>}
        {state.error && (
          <p className="form-error" role="alert">
            {state.error} <button type="button" className="btn btn-ghost btn-sm" onClick={load}>Retry</button>
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {offer && (
          <>
            <p>
              <strong>{formatPrice(offer.amount_minor)}</strong>{" "}
              <span className={`status-pill status-${offer.status}`}>{offer.status}</span>
            </p>
            <div className="offer-meta">
              <span>Listing: {offer.listing?.title}</span>
              <span>Buyer: {offer.buyer?.display_name ?? offer.buyer_id.slice(0, 8)}</span>
              <span>Created: {formatDateTime(offer.created_at)}</span>
              {offer.expires_at && <span>Expires: {formatDateTime(offer.expires_at)}</span>}
              {offer.responded_at && <span>Responded: {formatDateTime(offer.responded_at)}</span>}
            </div>
            {offer.message && <p>{offer.message}</p>}
            <div className="modal-actions">
              {canWithdraw && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy !== null}
                  onClick={() => {
                    if (window.confirm("Withdraw this offer?")) act("withdraw");
                  }}
                >
                  {busy === "withdraw" ? "Withdrawing…" : "Withdraw"}
                </button>
              )}
              {canRespond && (
                <>
                  <button type="button" className="btn btn-ghost" disabled={busy !== null} onClick={() => act("reject", "REJECTED")}>
                    {busy === "reject" ? "Rejecting…" : "Reject"}
                  </button>
                  <button type="button" className="btn btn-primary" disabled={busy !== null} onClick={() => act("accept", "ACCEPTED")}>
                    {busy === "accept" ? "Accepting…" : "Accept"}
                  </button>
                </>
              )}
            </div>
          </>
        )}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
