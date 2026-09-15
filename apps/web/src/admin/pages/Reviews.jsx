import { useState } from "react";

import { adminAction } from "../../api/admin.js";
import { ApiError } from "../../api/client.js";
import {
  ActionFeedback,
  EmptyState,
  ErrorState,
  FilterBar,
  FilterSearch,
  FilterSelect,
  Loading,
  Pagination,
  describeActionError,
  formatDateTime,
  StatusPill,
  useAdminData,
} from "../components/ui.jsx";
import ModerationDialog from "../components/ModerationDialog.jsx";

const STATUSES = ["ACTIVE", "REMOVED"];
const LIMIT = 20;

export function ReviewsPage() {
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState("");
  const [reviewerId, setReviewerId] = useState("");
  const [revieweeId, setRevieweeId] = useState("");
  const [orderId, setOrderId] = useState("");
  const { loading, error, data, reload } = useAdminData("/admin/reviews", {
    limit: LIMIT,
    offset,
    status,
    reviewer_id: reviewerId,
    reviewee_id: revieweeId,
    order_id: orderId,
  });

  return (
    <div>
      <h1>Reviews</h1>
      <FilterBar onSubmit={() => setOffset(0)}>
        <FilterSelect label="Status" value={status} onChange={(v) => { setStatus(v); setOffset(0); }} options={STATUSES} />
        <FilterSearch label="Reviewer ID" value={reviewerId} onChange={(v) => { setReviewerId(v); setOffset(0); }} placeholder="UUID..." />
        <FilterSearch label="Reviewee ID" value={revieweeId} onChange={(v) => { setRevieweeId(v); setOffset(0); }} placeholder="UUID..." />
        <FilterSearch label="Order ID" value={orderId} onChange={(v) => { setOrderId(v); setOffset(0); }} placeholder="UUID..." />
        <button type="submit" className="btn btn-primary">Apply</button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => { setStatus(""); setReviewerId(""); setRevieweeId(""); setOrderId(""); setOffset(0); }}
        >
          Clear
        </button>
      </FilterBar>

      {loading && <Loading label="Loading reviews..." />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && data.items.length === 0 && <EmptyState message="No reviews match these filters." />}
      {data && data.items.length > 0 && (
        <>
          <div className="table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Rating</th>
                  <th>Reviewer</th>
                  <th>Reviewee</th>
                  <th>Comment</th>
                  <th>Order</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((review) => (
                  <ReviewRow key={review.id} review={review} onChanged={reload} />
                ))}
              </tbody>
            </table>
          </div>
          <Pagination total={data.total} limit={LIMIT} offset={offset} onChange={setOffset} />
        </>
      )}
    </div>
  );
}

function ReviewRow({ review, onChanged }) {
  const [dialog, setDialog] = useState(false);
  const [feedback, setFeedback] = useState(null);

  async function runRemove(reason) {
    try {
      await adminAction(`/admin/reviews/${review.id}/remove`, reason);
      setDialog(false);
      setFeedback({ kind: "ok", message: "Review removed." });
      onChanged();
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 409)) {
        setDialog(false);
        setFeedback(describeActionError(err));
        onChanged();
      } else {
        throw err;
      }
    }
  }

  const comment = review.comment;
  const truncated = comment && comment.length > 60 ? comment.slice(0, 57) + "..." : comment;

  return (
    <tr>
      <td>{review.rating}</td>
      <td title={review.reviewer_id}>{review.reviewer_id.slice(0, 8)}</td>
      <td title={review.reviewee_id}>{review.reviewee_id.slice(0, 8)}</td>
      <td title={comment}>{truncated ?? "—"}</td>
      <td title={review.order_id}>{review.order_id.slice(0, 8)}</td>
      <td><StatusPill value={review.status} /></td>
      <td>{formatDateTime(review.created_at)}</td>
      <td>
        {review.status === "ACTIVE" ? (
          <>
            {feedback && (
              <div className={feedback.kind === "ok" ? "notice-ok" : "notice-err"}>
                <span>{feedback.message}</span>
              </div>
            )}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => { setFeedback(null); setDialog(true); }}
            >
              Remove
            </button>
          </>
        ) : (
          <span className="muted">—</span>
        )}
        {dialog && (
          <ModerationDialog
            title="Remove review"
            explanation={`Remove this ${review.rating}-star review? It will be hidden from public view. State changes are validated by the backend.`}
            confirmLabel="Remove"
            onCancel={() => setDialog(false)}
            onConfirm={runRemove}
          />
        )}
      </td>
    </tr>
  );
}