import RatingStars from "./RatingStars.jsx";

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** One received review: reviewer identity, stars, date, comment. */
export default function ReviewCard({ review, reviewerName }) {
  const name = reviewerName ?? "Former member";
  return (
    <li className="review-item">
      <span className="review-avatar" aria-hidden="true">
        {name.trim().charAt(0).toUpperCase() || "?"}
      </span>
      <div className="review-main">
        <div className="review-item-head">
          <strong>{name}</strong>
          <span className="muted small">{formatDate(review.created_at)}</span>
        </div>
        <RatingStars value={review.rating} size="sm" />
        {review.comment && <p className="review-comment">{review.comment}</p>}
      </div>
    </li>
  );
}
