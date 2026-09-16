const STEPS = ["Basics", "Price", "Images", "Preview"];

/**
 * Thin editorial progress: "Step X of Y" hierarchy + hairline segments.
 * Buttons allow revisiting reached steps only (same guards as before).
 */
export default function StepIndicator({ step, maxReached, onGo }) {
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
