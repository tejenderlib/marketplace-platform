import { useState } from "react";

import { formatPrice } from "../data/listings.js";

/** Make-an-offer dialog for FIXED_PRICE listings (backend authoritative). */
export default function OfferModal({ listing, onClose, onSubmit }) {
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [expiryDays, setExpiryDays] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    const amountMinor = Math.round(Number(amount) * 100);
    if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
      setError("Enter an offer amount greater than ₹0.");
      return;
    }
    let expiresAt = null;
    if (expiryDays.trim() !== "") {
      const days = Number(expiryDays);
      if (!Number.isFinite(days) || days <= 0 || days > 30) {
        setError("Expiry must be between 1 and 30 days, or left blank.");
        return;
      }
      expiresAt = new Date(Date.now() + days * 86400000).toISOString();
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        amount_minor: amountMinor,
        message: message.trim() === "" ? null : message.trim(),
        expires_at: expiresAt,
      });
    } catch (err) {
      setError(err.message ?? "Could not place the offer.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Make an offer">
      <form className="modal" onSubmit={submit}>
        <h2>Make an offer</h2>
        <p className="muted">
          {listing.title} · listed at {listing.priceLabel}
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <label>
          <span>Offer amount (₹)</span>
          <input
            type="number"
            min="1"
            step="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            disabled={busy}
            placeholder="e.g. 20000 for ₹20,000"
          />
        </label>
        <label>
          <span>Message (optional)</span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            maxLength={2000}
            disabled={busy}
            placeholder="Hi, is this still available?"
          />
        </label>
        <label>
          <span>Expires in days (optional, max 30)</span>
          <input
            type="number"
            min="1"
            max="30"
            value={expiryDays}
            onChange={(e) => setExpiryDays(e.target.value)}
            disabled={busy}
            placeholder="Leave blank for no expiry"
          />
        </label>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Sending…" : "Send offer"}
          </button>
        </div>
      </form>
    </div>
  );
}
