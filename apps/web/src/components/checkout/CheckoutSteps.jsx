/** Checkout progress indicator (display-only; pages own the flow). */
export default function CheckoutSteps({ steps, current }) {
  return (
    <ol className="ce-steps" aria-label="Checkout progress">
      {steps.map((label, index) => (
        <li
          key={label}
          className={
            index < current ? "ce-step is-done" : index === current ? "ce-step is-current" : "ce-step"
          }
          aria-current={index === current ? "step" : undefined}
        >
          <span className="ce-step-num" aria-hidden="true">
            {index < current ? "✓" : index + 1}
          </span>
          <span>{label}</span>
        </li>
      ))}
    </ol>
  );
}
