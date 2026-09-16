/**
 * Offer detail modal for buyer, seller, or ADMIN (backend enforces
 * visibility). Same fetch/respond/withdraw behavior; CE presentation with
 * a status timeline built from real timestamps only (created, expires,
 * responded) — no invented negotiation history.
 */

import { useEffect, useState } from "react";

import { formatPrice } from "../data/listings.js";
import Button from "./ui/Button.jsx";
import Modal from "./ui/Modal.jsx";
import Pill from "./ui/Pill.jsx";
import { ErrorState, LoadingState } from "./ui/States.jsx";

function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

const TERMINAL_NOTES = {
  ACCEPTED: "Accepted — the buyer can proceed to checkout.",
  REJECTED: "Declined by the seller. This decision is final.",
  WITHDRAWN: "Withdrawn by the buyer.",
  EXPIRED: "Expired without a response.",
  CANCELLED: "Cancelled.",
};

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
  const canCheckout = offer && offer.status === "ACCEPTED" && isBuyer;

  return (
    <Modal label="Offer details" onClose={onClose} dismissable={busy === null}>
      <h2>Offer details</h2>
      {state.loading && <LoadingState label="Loading offer…" />}
      {state.error && <ErrorState message={state.error} onRetry={load} />}
      {error && (
        <p className="ce-error" role="alert">
          {error}
        </p>
      )}
      {offer && (
        <div className="ce-offer">
          <div className="ce-offer-amount">
            <span className="ce-price ce-price--lg ce-tnum">
              {formatPrice(offer.amount_minor)}
            </span>
            <Pill status={offer.status}>{offer.status}</Pill>
          </div>

          <ol className="ce-timeline" aria-label="Offer history">
            <li>
              <span className="ce-timeline-dot" aria-hidden="true" />
              <div>
                <p>Offer placed</p>
                <p className="ce-small ce-muted">{formatDateTime(offer.created_at)}</p>
              </div>
            </li>
            {offer.expires_at && offer.status === "PENDING" && (
              <li>
                <span className="ce-timeline-dot" aria-hidden="true" />
                <div>
                  <p>Expires</p>
                  <p className="ce-small ce-muted">{formatDateTime(offer.expires_at)}</p>
                </div>
              </li>
            )}
            {offer.responded_at && (
              <li>
                <span className="ce-timeline-dot" aria-hidden="true" />
                <div>
                  <p>Responded</p>
                  <p className="ce-small ce-muted">{formatDateTime(offer.responded_at)}</p>
                </div>
              </li>
            )}
            {TERMINAL_NOTES[offer.status] && (
              <li>
                <span className="ce-timeline-dot" aria-hidden="true" />
                <div>
                  <p>{TERMINAL_NOTES[offer.status]}</p>
                </div>
              </li>
            )}
          </ol>

          <dl className="ce-facts">
            <div>
              <dt>Listing</dt>
              <dd>
                <a href={`#/listing/${offer.listing_id}`}>
                  {offer.listing?.title ?? "Listing"}
                </a>
              </dd>
            </div>
            <div>
              <dt>Buyer</dt>
              <dd>{offer.buyer?.display_name ?? offer.buyer_id.slice(0, 8)}</dd>
            </div>
            {offer.expires_at && (
              <div>
                <dt>Expires</dt>
                <dd>{formatDateTime(offer.expires_at)}</dd>
              </div>
            )}
          </dl>

          {offer.message && (
            <blockquote className="ce-offer-message">
              <p>{offer.message}</p>
            </blockquote>
          )}

          <div className="ce-modal-actions">
            {canWithdraw && (
              <Button
                variant="ghost"
                disabled={busy !== null}
                onClick={() => {
                  if (window.confirm("Withdraw this offer?")) act("withdraw");
                }}
              >
                {busy === "withdraw" ? "Withdrawing…" : "Withdraw"}
              </Button>
            )}
            {canRespond && (
              <>
                <Button variant="ghost" disabled={busy !== null} onClick={() => act("reject", "REJECTED")}>
                  {busy === "reject" ? "Rejecting…" : "Reject"}
                </Button>
                <Button variant="primary" disabled={busy !== null} onClick={() => act("accept", "ACCEPTED")}>
                  {busy === "accept" ? "Accepting…" : "Accept"}
                </Button>
              </>
            )}
            {canCheckout && (
              <Button variant="primary" href={`#/checkout/offer/${offer.id}`}>
                Proceed to checkout
              </Button>
            )}
            <Button variant={canRespond || canWithdraw || canCheckout ? "ghost" : "primary"} onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
