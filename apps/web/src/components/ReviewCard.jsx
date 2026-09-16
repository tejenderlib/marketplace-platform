import RatingStars from "./RatingStars.jsx";

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** One received review: reviewer identity, stars, date, comment. */
export default function ReviewCard({ review, reviewerName }) {
  const name = reviewerName ?? "Former member";
  return (
    <li className="ce-review">
      <div className="ce-review-head">
        <span className="ce-avatar" aria-hidden="true">
          {name.trim().charAt(0).toUpperCase() || "?"}
        </span>
        <strong>{name}</strong>
        <span className="ce-small ce-muted">{formatDate(review.created_at)}</span>
      </div>
      <RatingStars value={review.rating} size="sm" />
      {review.comment && <p>{review.comment}</p>}
    </li>
  );
}
