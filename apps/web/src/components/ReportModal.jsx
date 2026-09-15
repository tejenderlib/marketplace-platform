import { useEffect, useState } from "react";

import { createReport } from "../api/reports.js";
import { useAuth } from "../auth/AuthContext.jsx";

const REASONS = [
  "SPAM",
  "FAKE_LISTING",
  "INAPPROPRIATE_CONTENT",
  "MISLEADING_PRICE",
  "PROHIBITED_ITEM",
  "SCAM",
  "HARASSMENT",
  "FRAUD",
  "OTHER",
];

const TARGET_LABELS = {
  listing: "listing",
  user: "user",
};

/** Report a listing or a user to moderation. */
export default function ReportModal({ targetType, targetId, onClose, onReported }) {
  const { authFetch } = useAuth();
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const label = TARGET_LABELS[targetType] ?? "item";

  useEffect(() => {
    function onKey(event) {
      if (event.key === "Escape" && !busy) onClose?.();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    if (!reason) {
      setError("Choose a reason for the report.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload = { target_type: targetType.toUpperCase(), reason };
      if (targetType === "listing") payload.target_listing_id = targetId;
      else payload.target_user_id = targetId;
      if (details.trim()) payload.details = details.trim();
      await createReport(authFetch, payload);
      onReported?.();
      onClose?.();
    } catch (err) {
      setError(err.message ?? "Could not submit the report.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Report this item">
      <form className="modal" onSubmit={submit}>
        <h2>Report {label}</h2>
        <p className="muted">Reports go to moderation and are reviewed in order.</p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <label>
          <span>Reason</span>
          <select value={reason} onChange={(e) => setReason(e.target.value)} disabled={busy}>
            <option value="">Select a reason…</option>
            {REASONS.map((item) => (
              <option key={item} value={item}>{item.replaceAll("_", " ")}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Details (optional)</span>
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            rows={4}
            maxLength={2000}
            disabled={busy}
            placeholder="Anything that helps moderation understand the issue."
            aria-describedby="report-details-count"
          />
          <span id="report-details-count" className="muted small">
            {details.length}/2000
          </span>
        </label>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Submitting…" : "Submit report"}
          </button>
        </div>
      </form>
    </div>
  );
}