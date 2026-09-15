import { useCallback, useEffect, useState } from "react";

import { allMyReviews } from "../api/reviews.js";
import { useAuth } from "../auth/AuthContext.jsx";

/** Set of order ids the current user has reviewed (for reviewed-state UI). */
export function useReviewedOrders() {
  const { isAuthenticated, authFetch } = useAuth();
  const [reviewedIds, setReviewedIds] = useState(() => new Set());
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) return;
    const { items } = await allMyReviews(authFetch);
    setReviewedIds(new Set(items.map((review) => review.order_id)));
    setLoaded(true);
  }, [isAuthenticated, authFetch]);

  useEffect(() => {
    let alive = true;
    if (isAuthenticated) {
      refresh()
        .catch(() => {
          if (alive) setLoaded(true);
        });
    }
    return () => {
      alive = false;
    };
  }, [isAuthenticated, refresh]);

  function markReviewed(orderId) {
    setReviewedIds((prev) => new Set(prev).add(orderId));
  }

  return { reviewedIds, reviewedLoaded: loaded, refreshReviewed: refresh, markReviewed };
}