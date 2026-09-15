/** Star rating widget: interactive input (when onChange given) or read-only. */

const STAR = "★";
const STAR_OUTLINE = "☆";

export default function RatingStars({ value = 0, onChange, size = "md" }) {
  if (onChange) {
    return (
      <div
        className={`rating-stars rating-input rating-${size}`}
        role="radiogroup"
        aria-label="Rating"
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
            className={value >= n ? "is-on" : ""}
            onClick={() => onChange(n)}
          >
            {STAR}
          </button>
        ))}
      </div>
    );
  }

  const pct = Math.max(0, Math.min(5, value)) / 5 * 100;
  return (
    <div
      className={`rating-stars rating-display rating-${size}`}
      role="img"
      aria-label={`${value} out of 5 stars`}
    >
      <div className="rating-track" aria-hidden="true">
        <span className="rating-track-fill" style={{ width: `${pct}%` }}>
          {"★".repeat(5)}
        </span>
      </div>
    </div>
  );
}