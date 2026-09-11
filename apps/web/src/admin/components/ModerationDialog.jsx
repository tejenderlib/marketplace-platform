import { useState } from "react";

const MAX_REASON = 2000;

/** Reusable moderation confirmation dialog (reason required, backend decides). */
export default function ModerationDialog({ title, explanation, confirmLabel, onCancel, onConfirm }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const valid = reason.trim().length > 0 && reason.length <= MAX_REASON;

  async function submit(e) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <form className="dialog" onSubmit={submit}>
        <h2>{title}</h2>
        <p className="muted">{explanation}</p>
        {error && (
          <p className="form-error" role="alert">
            {error.message ?? String(error)}
          </p>
        )}
        <label>
          <span>Reason (required)</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            maxLength={MAX_REASON}
            required
            disabled={busy}
            placeholder="Why is this action needed?"
          />
        </label>
        <p className="muted small">{reason.length} / {MAX_REASON}</p>
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn btn-danger" disabled={!valid || busy}>
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
