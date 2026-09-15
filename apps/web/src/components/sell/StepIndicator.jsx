const STEPS = ["Basics", "Price", "Images", "Preview"];

/** Linear step indicator (buttons allow revisiting completed steps only). */
export default function StepIndicator({ step, maxReached, onGo }) {
  return (
    <ol className="sell-steps" aria-label="Sell progress">
      {STEPS.map((label, index) => {
        const reachable = index <= maxReached;
        const state =
          index < step ? "done" : index === step ? "current" : "todo";
        return (
          <li key={label} className={`sell-step ${state}`} aria-current={index === step ? "step" : undefined}>
            <button
              type="button"
              disabled={!reachable || index === step}
              onClick={() => onGo(index)}
              aria-label={`Step ${index + 1}: ${label}${index < step ? " (completed)" : ""}`}
            >
              <span className="sell-step-num" aria-hidden="true">
                {index < step ? "✓" : index + 1}
              </span>
              <span>{label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
