/**
 * Make-an-offer dialog for FIXED_PRICE listings (backend authoritative).
 * Same validation + payload as before; presentation on the CE Modal shell
 * (focus-trap, autofocus, Escape, sheet ≤640px owned by Modal).
 */

import { useRef, useState } from "react";

import Button from "./ui/Button.jsx";
import Field from "./ui/Field.jsx";
import Modal from "./ui/Modal.jsx";
import { formatPrice } from "../data/listings.js";

/** Parse a rupee string to paise without float error ("20000.50" -> 2000050). */
function rupeesToMinor(raw) {
  const text = String(raw ?? "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return NaN;
  const [whole, frac = ""] = text.split(".");
  return Number(whole) * 100 + Number((frac + "00").slice(0, 2));
}

export default function OfferModal({ listing, onClose, onSubmit }) {
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [expiryDays, setExpiryDays] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const firstFieldRef = useRef(null);

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    const amountMinor = rupeesToMinor(amount);
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
    <Modal label="Make an offer" onClose={onClose} dismissable={!busy} initialFocusRef={firstFieldRef}>
      <form onSubmit={submit}>
        <h2>Make an offer</h2>
        <p className="ce-small ce-muted">
          {listing.title} · listed at {listing.priceLabel}
        </p>
        {error && (
          <p className="ce-error" role="alert">
            {error}
          </p>
        )}
        <div className="ce-form">
          <Field label="Offer amount (₹)" hint="Your offer is binding if the seller accepts.">
            {({ describedBy, invalid }) => (
              <input
                ref={firstFieldRef}
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                disabled={busy}
                placeholder="e.g. 20000 for ₹20,000"
                aria-describedby={describedBy}
                aria-invalid={invalid}
              />
            )}
          </Field>
          <Field label="Message (optional)">
            {() => (
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                maxLength={2000}
                disabled={busy}
                placeholder="Hi, is this still available?"
              />
            )}
          </Field>
          <Field label="Expires in days (optional, max 30)" hint="Leave blank for no expiry.">
            {() => (
              <input
                type="number"
                min="1"
                max="30"
                value={expiryDays}
                onChange={(e) => setExpiryDays(e.target.value)}
                disabled={busy}
                placeholder="Leave blank for no expiry"
              />
            )}
          </Field>
        </div>
        <div className="ce-modal-actions">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={busy}>
            {busy ? "Sending…" : "Send offer"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
