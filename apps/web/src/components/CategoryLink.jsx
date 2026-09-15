/**
 * Single directory link (subcategory). Always resolves to a real backend
 * category id (or "All") via the shared directory builder, so clicking it
 * flows through the existing `onSelect(categoryId)` filtering contract.
 */
export default function CategoryLink({ name, targetId, active, onSelect }) {
  return (
    <button
      type="button"
      className={active ? "catdir-link is-active" : "catdir-link"}
      onClick={() => onSelect(targetId)}
      aria-current={active ? "true" : undefined}
    >
      {name}
    </button>
  );
}
