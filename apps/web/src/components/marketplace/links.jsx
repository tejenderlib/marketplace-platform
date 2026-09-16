/**
 * Minimal valid-HTML link helper: renders <a> for card-style compositions
 * whose children are otherwise spans (avoids nested-interactive issues).
 */

export function Link({ href, label, className, children }) {
  return (
    <a className={className} href={href} aria-label={label}>
      {children}
    </a>
  );
}
