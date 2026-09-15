import { useEffect, useState } from "react";

import { ApiError } from "../api/client.js";
import { formatPrice } from "../data/listings.js";
import RatingStars from "./RatingStars.jsx";

/** Write-a-review dialog for an eligible (DELIVERED) order. */
export default function ReviewModal({ order, counterPartyName, onClose, onSubmit }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    function onKey(event) {
      if (event.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    if (rating < 1) {
      setError("Choose a star rating from 1 to 5.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ order_id: order.id, rating, comment: comment.trim() === "" ? null : comment.trim() });
    } catch (err) {
      const duplicate = err instanceof ApiError && err.status === 409;
      setError(
        duplicate
          ? "You have already reviewed this order."
          : (err.message ?? "Could not submit the review.")
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Rate and review">
      <form className="modal" onSubmit={submit}>
        <h2>Rate &amp; Review</h2>
        <p className="muted">
          {order.listing_title_snapshot} · {formatPrice(order.total_minor)}
          {counterPartyName ? ` · Reviewed: ${counterPartyName}` : ""}
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <label>
          <span>Your rating</span>
          <RatingStars value={rating} onChange={setRating} />
        </label>
        <label>
          <span>Comment (optional)</span>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            maxLength={2000}
            disabled={busy}
            placeholder="How was this purchase experience?"
            aria-describedby="review-comment-count"
          />
          <span id="review-comment-count" className="muted small">
            {comment.length}/2000
          </span>
        </label>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Submitting…" : "Submit review"}
          </button>
        </div>
      </form>
    </div>
  );
}