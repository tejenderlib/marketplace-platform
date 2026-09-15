/** Checkout progress indicator (display-only; pages own the flow). */
export default function CheckoutSteps({ steps, current }) {
  return (
    <ol className="steps" aria-label="Checkout progress">
      {steps.map((label, index) => (
        <li
          key={label}
          className={
            index < current ? "step done" : index === current ? "step current" : "step"
          }
          aria-current={index === current ? "step" : undefined}
        >
          <span>
            {index + 1}. {label}
          </span>
        </li>
      ))}
    </ol>
  );
}
