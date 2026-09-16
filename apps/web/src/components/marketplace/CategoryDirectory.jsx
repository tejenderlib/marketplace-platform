/**
 * CategoryDirectory: catalogue-style index over the shared
 * buildDirectory() source (test rows filtered, names deduped at the
 * source). Every control resolves to a real backend id (or "All") via the
 * existing onSelect(id) contract. `compact` renders the single-column
 * sheet variant for mobile.
 */

import { useMemo } from "react";

import { buildDirectory } from "../../data/categoryDirectory.js";

export default function CategoryDirectory({
  categories,
  active,
  onSelect,
  loading,
  error,
  onRetry,
  compact,
}) {
  const groups = useMemo(() => buildDirectory(categories), [categories]);

  if (loading) {
    return (
      <p className="ce-small ce-muted" role="status">
        Loading categories…
      </p>
    );
  }
  if (error) {
    return (
      <div className="ce-cluster" role="alert">
        <p className="ce-small">Could not load categories.</p>
        <button
          type="button"
          className="ce-btn ce-btn--ghost ce-btn--sm"
          onClick={onRetry}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className={compact ? "ce-catalog ce-catalog--compact" : "ce-catalog"}>
      {groups.map((group) => (
        <section
          key={group.key}
          aria-label={group.name}
          className={
            group.key === "industrial"
              ? "ce-catalog-group is-featured"
              : "ce-catalog-group"
          }
        >
          <button
            type="button"
            className={
              active === group.targetId
                ? "ce-catalog-heading is-active"
                : "ce-catalog-heading"
            }
            aria-current={active === group.targetId ? "true" : undefined}
            onClick={() => onSelect(group.targetId)}
          >
            {group.name}
          </button>
          <ul className="ce-catalog-links">
            {group.links.map((link) => (
              <li key={`${group.key}-${link.name}`}>
                <button
                  type="button"
                  className={
                    active === link.targetId
                      ? "ce-catalog-link is-active"
                      : "ce-catalog-link"
                  }
                  aria-current={active === link.targetId ? "true" : undefined}
                  onClick={() => onSelect(link.targetId)}
                >
                  {link.name}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
