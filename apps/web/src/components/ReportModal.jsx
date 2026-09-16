import { useRef, useState } from "react";

import { createReport } from "../api/reports.js";
import { useAuth } from "../auth/AuthContext.jsx";
import Button from "./ui/Button.jsx";
import Modal from "./ui/Modal.jsx";

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
  const firstFieldRef = useRef(null);

  const label = TARGET_LABELS[targetType] ?? "item";

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
    <Modal label="Report this item" onClose={onClose} dismissable={!busy} initialFocusRef={firstFieldRef}>
      <form onSubmit={submit}>
        <h2>Report {label}</h2>
        <p className="ce-small ce-muted">Reports go to moderation and are reviewed in order.</p>
        {error && (
          <p className="ce-error" role="alert">
            {error}
          </p>
        )}
        <div className="ce-form">
          <label className="ce-field">
            <span>Reason</span>
            <select ref={firstFieldRef} value={reason} onChange={(e) => setReason(e.target.value)} disabled={busy}>
            <option value="">Select a reason…</option>
            {REASONS.map((item) => (
              <option key={item} value={item}>{item.replaceAll("_", " ")}</option>
            ))}
          </select>
        </label>
        <label className="ce-field">
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
          <span id="report-details-count" className="ce-hint">
            {details.length}/2000
          </span>
        </label>
        </div>
        <div className="ce-modal-actions">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={busy}>
            {busy ? "Submitting…" : "Submit report"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}