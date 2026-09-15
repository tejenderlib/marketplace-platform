import CategoryLink from "./CategoryLink.jsx";

/**
 * One directory group: accent-colored heading + subcategory link list.
 * On mobile the group collapses into an accordion row (the caret toggle is
 * only visible below the tablet breakpoint; the heading filter link always
 * works on every breakpoint).
 */
export default function CategoryGroup({
  group,
  active,
  onSelect,
  expanded,
  onToggle,
  collapsible,
}) {
  const headingId = `catdir-heading-${group.key}`;
  const listId = `catdir-list-${group.key}`;
  return (
    <div className="catdir-group">
      <div className="catdir-group-head">
        <button
          type="button"
          id={headingId}
          className="catdir-heading"
          onClick={() => onSelect(group.targetId)}
          aria-current={active === group.targetId ? "true" : undefined}
        >
          {group.name}
        </button>
        {collapsible && (
          <button
            type="button"
            className={expanded ? "catdir-caret is-open" : "catdir-caret"}
            onClick={onToggle}
            aria-expanded={expanded}
            aria-controls={listId}
            aria-label={expanded ? `Collapse ${group.name}` : `Expand ${group.name}`}
          >
            <span aria-hidden="true">▾</span>
          </button>
        )}
      </div>
      {(!collapsible || expanded) && (
        <ul className="catdir-list" id={collapsible ? listId : undefined} aria-labelledby={headingId}>
          {group.links.map((link) => (
            <li key={`${group.key}-${link.name}`}>
              <CategoryLink
                name={link.name}
                targetId={link.targetId}
                active={active === link.targetId}
                onSelect={onSelect}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
