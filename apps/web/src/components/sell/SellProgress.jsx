import Button from "../ui/Button.jsx";

export const SELL_STEPS = [
  { label: "Add Photos", sub: "Upload images" },
  { label: "Details", sub: "Item info & price" },
  { label: "Preview", sub: "Review listing" },
  { label: "Publish", sub: "Go live" },
];

/**
 * SellProgress: compact 4-step tracker (number — number — number — number
 * with labels) plus the page-level Save Draft action on the right.
 * Pure UI — step state and saving live in the page.
 */
export default function SellProgress({ step, maxReached, onGo, onSaveDraft, saving }) {
  return (
    <div className="sell-progress">
      <ol className="sell-progress-steps" aria-label="Sell progress">
        {SELL_STEPS.map((item, index) => {
          const reachable = index <= maxReached;
          const state = index < step ? "is-done" : index === step ? "is-current" : "";
          return (
            <li key={item.label} className={`sell-progress-step ${state}`.trim()}>
              <button
                type="button"
                disabled={!reachable || index === step}
                onClick={() => onGo(index)}
                aria-label={`Step ${index + 1}: ${item.label}${index < step ? " (completed)" : index === step ? " (current)" : ""}`}
                aria-current={index === step ? "step" : undefined}
              >
                <span className="sell-progress-num" aria-hidden="true">
                  {index < step ? "✓" : index + 1}
                </span>
                <span className="sell-progress-label">{item.label}</span>
              </button>
              {index < SELL_STEPS.length - 1 && (
                <span className="sell-progress-line" aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ol>
      <Button variant="secondary" size="sm" disabled={saving} onClick={onSaveDraft}>
        {saving ? "Saving…" : "Save Draft"}
      </Button>
    </div>
  );
}
