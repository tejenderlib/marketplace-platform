/** CE Field: label + control + hint/error slots with describedby wiring. */

import { useId } from "react";

export default function Field({
  label,
  hint,
  error,
  ok,
  children,
}) {
  const hintId = useId();
  const errorId = useId();
  const describedBy = [hint ? hintId : null, error ? errorId : null]
    .filter(Boolean)
    .join(" ") || undefined;
  const control = typeof children === "function"
    ? children({ describedBy, invalid: Boolean(error) })
    : children;
  return (
    <label className="ce-field">
      {label ? <span>{label}</span> : null}
      {control}
      {hint && !error ? (
        <span className="ce-hint" id={hintId}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span className="ce-error" id={errorId} role="alert">
          {error}
        </span>
      ) : null}
      {ok && !error ? <span className="ce-ok">{ok}</span> : null}
    </label>
  );
}
