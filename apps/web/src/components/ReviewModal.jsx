import { useState } from "react";

import { ApiError } from "../api/client.js";
import { formatPrice } from "../data/listings.js";
import RatingStars from "./RatingStars.jsx";
import Button from "./ui/Button.jsx";
import Modal from "./ui/Modal.jsx";

/** Write-a-review dialog for an eligible (DELIVERED) order. Logic unchanged. */
export default function ReviewModal({ order, counterPartyName, onClose, onSubmit }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

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
    <Modal label="Rate and review" onClose={onClose} dismissable={!busy}>
      <form onSubmit={submit}>
        <h2>Rate &amp; Review</h2>
        <p className="ce-small ce-muted">
          {order.listing_title_snapshot} · {formatPrice(order.total_minor)}
          {counterPartyName ? ` · Reviewed: ${counterPartyName}` : ""}
        </p>
        {error && (
          <p className="ce-error" role="alert">
            {error}
          </p>
        )}
        <div className="ce-form">
          <div className="ce-field">
            <span id="review-rating-label">Your rating</span>
            <div role="group" aria-labelledby="review-rating-label">
              <RatingStars value={rating} onChange={setRating} />
            </div>
          </div>
          <label className="ce-field">
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
            <span id="review-comment-count" className="ce-hint">
              {comment.length}/2000
            </span>
          </label>
        </div>
        <div className="ce-modal-actions">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={busy}>
            {busy ? "Submitting…" : "Submit review"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
