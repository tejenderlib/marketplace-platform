import Button from "../ui/Button.jsx";

/**
 * SellActions: bottom action bar for the Sell Item wizard.
 * The primary action stays disabled until the step is valid.
 */
export default function SellActions({
  onBack,
  backLabel = "← Back",
  showBack = true,
  onNext,
  nextLabel = "Next →",
  nextDisabled = false,
  busy = false,
}) {
  return (
    <div className="sell-actions">
      {showBack ? (
        <Button variant="ghost" disabled={busy} onClick={onBack}>
          {backLabel}
        </Button>
      ) : (
        <span />
      )}
      <Button variant="primary" disabled={nextDisabled || busy} onClick={onNext}>
        {busy ? "Working…" : nextLabel}
      </Button>
    </div>
  );
}
