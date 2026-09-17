const DEFAULT_STEPS = [
  { label: "Photos", sub: "Add clear photos" },
  { label: "Details", sub: "Item info" },
  { label: "Pricing", sub: "Sale terms" },
  { label: "Review", sub: "Check and publish" },
];

/**
 * Sell progress. Default thin editorial style ("Step X of Y" + hairline
 * segments). `variant="pills"` renders the marketplace 4-pill style with
 * per-step sublabels. Labels always describe the REAL wizard order —
 * never remap them to a different flow. Buttons allow revisiting reached
 * steps only (same guards as before).
 */
export default function StepIndicator({ step, maxReached, onGo, variant, steps = DEFAULT_STEPS }) {
  if (variant === "pills") {
    return (
      <ol className="sell-steps" aria-label="Sell progress">
        {steps.map((item, index) => {
          const reachable = index <= maxReached;
          const state =
            index < step ? "is-done" : index === step ? "is-current" : "";
          return (
            <li key={item.label} className={`sell-step ${state}`.trim()} aria-current={index === step ? "step" : undefined}>
              <button
                type="button"
                disabled={!reachable || index === step}
                onClick={() => onGo(index)}
                aria-label={`Step ${index + 1}: ${item.label}${index < step ? " (completed)" : index === step ? " (current)" : ""}`}
              >
                <span className="sell-step-num" aria-hidden="true">
                  {index < step ? "✓" : index + 1}
                </span>
                <span className="sell-step-text">
                  <span className="sell-step-label">{item.label}</span>
                  <span className="sell-step-sub">{item.sub}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    );
  }

  const STEPS = steps.map((item) => item.label);
  return (
    <div className="ce-progress">
      <div className="ce-progress-label">
        <p className="ce-micro ce-muted">
          Step {step + 1} of {STEPS.length}
        </p>
        <p className="ce-h3" aria-current="step">
          {STEPS[step]}
        </p>
      </div>
      <div className="ce-progress-track" role="group" aria-label="Sell progress">
        {STEPS.map((label, index) => {
          const reachable = index <= maxReached;
          const state =
            index < step ? "is-done" : index === step ? "is-current" : "";
          return (
            <button
              key={label}
              type="button"
              className={`ce-progress-seg ${state}`.trim()}
              disabled={!reachable || index === step}
              onClick={() => onGo(index)}
              aria-label={`Step ${index + 1}: ${label}${index < step ? " (completed)" : index === step ? " (current)" : ""}`}
            />
          );
        })}
      </div>
      <ol className="ce-visually-hidden">
        {STEPS.map((label) => (
          <li key={label}>{label}</li>
        ))}
      </ol>
    </div>
  );
}
