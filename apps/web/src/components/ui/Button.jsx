/** CE Button: thin mapper over button/a. No new behavior contract. */

const VARIANTS = {
  primary: "ce-btn ce-btn--primary",
  secondary: "ce-btn ce-btn--secondary",
  ghost: "ce-btn ce-btn--ghost",
  danger: "ce-btn ce-btn--danger",
};

export default function Button({
  variant = "primary",
  size,
  block,
  href,
  children,
  className,
  ...rest
}) {
  const cls = [
    VARIANTS[variant] ?? VARIANTS.primary,
    size === "sm" ? "ce-btn--sm" : "",
    block ? "ce-btn--block" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  if (href) {
    return (
      <a className={cls} href={href} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" className={cls} {...rest}>
      {children}
    </button>
  );
}
