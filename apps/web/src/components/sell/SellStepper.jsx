const STEPS = ["Photos", "Details", "Preview", "Publish"];

/**
 * SellStepper: minimal centered bottom indicator (①─②─③─④ + labels).
 * The active step renders black; the rest render gray.
 * Pure UI — step state lives in the page.
 */
export default function SellStepper({ step, maxReached, onGo }) {
  return (
    <ol className="sell-stepper" aria-label="Sell progress">
      {STEPS.map((label, index) => {
        const reachable = index <= maxReached;
        const state = index < step ? "is-done" : index === step ? "is-current" : "";
        return (
          <li key={label} className={`sell-stepper-step ${state}`.trim()}>
            <button
              type="button"
              disabled={!reachable || index === step}
              onClick={() => onGo(index)}
              aria-label={`Step ${index + 1}: ${label}${index < step ? " (completed)" : index === step ? " (current)" : ""}`}
              aria-current={index === step ? "step" : undefined}
            >
              <span className="sell-stepper-circle" aria-hidden="true">{index + 1}</span>
              <span className="sell-stepper-label">{label}</span>
            </button>
            {index < STEPS.length - 1 && (
              <span className="sell-stepper-line" aria-hidden="true" />
            )}
          </li>
        );
      })}
    </ol>
  );
}
