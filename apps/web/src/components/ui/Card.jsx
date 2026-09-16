/** CE Card: single surface. Variants: soft | warm | flat. */

export default function Card({ variant, pad, children, className, ...rest }) {
  const cls = [
    "ce-card",
    variant === "soft" ? "ce-card--soft" : "",
    variant === "warm" ? "ce-card--warm" : "",
    variant === "flat" ? "ce-card--flat" : "",
    pad === "sm" ? "ce-card--pad-sm" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={cls} {...rest}>
      {children}
    </div>
  );
}
