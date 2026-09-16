/** CE feedback states with baked-in roles. Thin wrappers, no styling API. */

import Button from "./Button.jsx";

export function LoadingState({ label = "Loading…" }) {
  return (
    <div className="ce-state" role="status">
      <p>{label}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="ce-state ce-state--error" role="alert">
      <p>{message}</p>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}

export function EmptyState({ title, hint, action }) {
  return (
    <div className="ce-empty" role="status">
      <h3>{title}</h3>
      {hint ? <p className="ce-muted ce-small">{hint}</p> : null}
      {action}
    </div>
  );
}

export function Notice({ tone, children, onDismiss, dismissLabel = "Dismiss" }) {
  const cls = [
    "ce-notice",
    tone === "error" ? "ce-notice--error" : "",
    tone === "warning" ? "ce-notice--warning" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={cls} role={tone === "error" ? "alert" : "status"}>
      <span>{children}</span>
      {onDismiss ? (
        <button
          type="button"
          className="ce-btn ce-btn--ghost ce-btn--sm"
          onClick={onDismiss}
          aria-label={dismissLabel}
        >
          ✕
        </button>
      ) : null}
    </div>
  );
}

export default EmptyState;
