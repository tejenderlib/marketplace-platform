import { useEffect, useState } from "react";

import { ApiError } from "../api/client.js";
import { fetchPublicProfile } from "../api/catalog.js";
import { revieweeReviews } from "../api/reviews.js";
import RatingStars from "./RatingStars.jsx";

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** Received reviews + aggregate for a reviewee (auth-gated read). */
export default function ReviewsSection({ authFetch, isAuthenticated, userId, limit = 20 }) {
  const [state, setState] = useState({ loading: true, error: null, summary: null });
  const [reviewerNames, setReviewerNames] = useState({});

  useEffect(() => {
    let alive = true;
    setState({ loading: true, error: null, summary: null });
    setReviewerNames({});
    if (!userId) return () => { alive = false; };
    if (!isAuthenticated) {
      setState({ loading: false, error: null, summary: null });
      return () => { alive = false; };
    }
    (async () => {
      try {
        const summary = await revieweeReviews(authFetch, userId, { limit, offset: 0 });
        if (!alive) return;
        setState({ loading: false, error: null, summary });
        const reviewerIds = [...new Set(summary.items.map((review) => review.reviewer_id))];
        const names = await Promise.all(
          reviewerIds.map(async (reviewerId) => {
            try {
              const profile = await fetchPublicProfile(reviewerId);
              return [reviewerId, profile.display_name ?? null];
            } catch {
              return [reviewerId, null];
            }
          })
        );
        if (!alive) return;
        setReviewerNames(Object.fromEntries(names));
      } catch (err) {
        if (!alive) return;
        setState({
          loading: false,
          error: err instanceof ApiError ? `Could not load reviews (${err.status}).` : "Network error.",
          summary: null,
        });
      }
    })();
    return () => {
      alive = false;
    };
  }, [authFetch, isAuthenticated, userId, limit]);

  if (!isAuthenticated) {
    return <p className="muted small">Sign in to see the reviews.</p>;
  }
  if (state.loading) {
    return <p className="muted" role="status">Loading reviews…</p>;
  }
  if (state.error) {
    return <p className="form-error" role="alert">{state.error}</p>;
  }
  const { summary } = state;
  if (!summary || summary.total === 0) {
    return (
      <div className="empty-state">
        <p>No reviews yet.</p>
      </div>
    );
  }
  const average = summary.average_rating;
  return (
    <>
      <div className="review-summary">
        <RatingStars value={average ?? 0} />
        <span className="muted small">
          {average !== null ? `${average.toFixed(1)} out of 5` : "No rating yet"} ·{" "}
          <strong>{summary.total}</strong> review{summary.total === 1 ? "" : "s"}
        </span>
      </div>
      <ul className="review-list">
        {summary.items.map((review) => (
          <li className="review-item" key={review.id}>
            <div className="review-item-head">
              <strong>{reviewerNames[review.reviewer_id] ?? "Former member"}</strong>
              <span className="muted small">{formatDate(review.created_at)}</span>
            </div>
            <RatingStars value={review.rating} size="sm" />
            {review.comment && <p className="review-comment">{review.comment}</p>}
          </li>
        ))}
      </ul>
    </>
  );
}