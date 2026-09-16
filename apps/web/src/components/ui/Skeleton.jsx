/** CE skeleton block (geometry set by caller via style/width). */

export default function Skeleton({ width, height = "1rem", label = "Loading…" }) {
  return (
    <div
      className="ce-skeleton"
      role="status"
      aria-label={label}
      style={{ width: width ?? "100%", height }}
    />
  );
}
