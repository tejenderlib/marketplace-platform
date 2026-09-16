import { useRef, useState } from "react";

import Button from "../../components/ui/Button.jsx";
import Modal from "../../components/ui/Modal.jsx";

const MAX_REASON = 2000;

/** Reusable moderation confirmation dialog (reason required, backend decides). Logic unchanged. */
export default function ModerationDialog({ title, explanation, confirmLabel, onCancel, onConfirm }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const firstFieldRef = useRef(null);
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
    <Modal label={title} onClose={onCancel} dismissable={!busy} initialFocusRef={firstFieldRef}>
      <form onSubmit={submit}>
        <h2>{title}</h2>
        <p className="ce-small ce-muted">{explanation}</p>
        {error && (
          <p className="ce-error" role="alert">
            {error.message ?? String(error)}
          </p>
        )}
        <label className="ce-field">
          <span>Reason (required)</span>
          <textarea
            ref={firstFieldRef}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            maxLength={MAX_REASON}
            required
            disabled={busy}
            placeholder="Why is this action needed?"
            aria-describedby="mod-reason-count"
          />
          <span id="mod-reason-count" className="ce-hint" aria-live="polite">
            {reason.length} / {MAX_REASON}
          </span>
        </label>
        <div className="ce-modal-actions">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" type="submit" disabled={!valid || busy}>
            {busy ? "Working…" : confirmLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
