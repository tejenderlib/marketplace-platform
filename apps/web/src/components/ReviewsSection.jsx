import { useEffect, useState } from "react";

import { ApiError } from "../api/client.js";
import { fetchPublicProfile } from "../api/catalog.js";
import { revieweeReviews } from "../api/reviews.js";
import RatingStars from "./RatingStars.jsx";
import ReviewCard from "./ReviewCard.jsx";

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
    return <p className="ce-small ce-muted">Sign in to see the reviews.</p>;
  }
  if (state.loading) {
    return <p className="ce-small ce-muted" role="status">Loading reviews…</p>;
  }
  if (state.error) {
    return <p className="ce-error" role="alert">{state.error}</p>;
  }
  const { summary } = state;
  if (!summary || summary.total === 0) {
    return (
      <p className="ce-small ce-muted" role="status">No reviews yet.</p>
    );
  }
  const average = summary.average_rating;
  return (
    <div className="ce-stack">
      <div className="ce-cluster">
        <RatingStars value={average ?? 0} />
        <span className="ce-small ce-muted">
          {average !== null ? `${average.toFixed(1)} out of 5` : "No rating yet"} ·{" "}
          <strong className="ce-tnum">{summary.total}</strong> review{summary.total === 1 ? "" : "s"}
        </span>
      </div>
      <ul className="ce-rows">
        {summary.items.map((review) => (
          <ReviewCard
            key={review.id}
            review={review}
            reviewerName={reviewerNames[review.reviewer_id]}
          />
        ))}
      </ul>
    </div>
  );
}