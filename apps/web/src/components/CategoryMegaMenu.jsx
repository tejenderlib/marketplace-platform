import { useEffect, useMemo, useState } from "react";

import { buildDirectory } from "../data/categoryDirectory.js";
import CategoryGroup from "./CategoryGroup.jsx";

/**
 * Header mega-menu body: multi-column retail directory built from the
 * SHARED `buildDirectory()` data (same source as the homepage section).
 * Below the phone breakpoint the columns collapse into an accordion list.
 * Selection flows through the existing `onSelect(categoryId)` contract;
 * the footer action uses `onViewAll` (falls back to `onSelect("All")`).
 */
export default function CategoryMegaMenu({
  categories,
  active,
  onSelect,
  loading,
  error,
  onRetry,
  onViewAll,
}) {
  const groups = useMemo(() => buildDirectory(categories), [categories]);
  const [expanded, setExpanded] = useState(null);
  const [collapsible, setCollapsible] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 700px)").matches,
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 700px)");
    function onChange(event) {
      setCollapsible(event.matches);
      setExpanded(null);
    }
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  if (loading) {
    return (
      <p className="muted catdir-note" role="status">
        Loading categories…
      </p>
    );
  }
  if (error) {
    return (
      <div className="empty-state" role="alert">
        <p>Could not load categories. {error.message ?? ""}</p>
        <button type="button" className="btn btn-primary" onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  }

  function handleViewAll() {
    if (onViewAll) {
      onViewAll();
    } else {
      onSelect("All");
    }
  }

  return (
    <nav className="catdir" aria-label="Category directory">
      <div className="catdir-columns">
        {groups.map((group) => (
          <CategoryGroup
            key={group.key}
            group={group}
            active={active}
            onSelect={onSelect}
            collapsible={collapsible}
            expanded={collapsible ? expanded === group.key : true}
            onToggle={() =>
              setExpanded((current) => (current === group.key ? null : group.key))
            }
          />
        ))}
      </div>
      <div className="catdir-foot">
        <button type="button" className="catdir-viewall" onClick={handleViewAll}>
          View all auctions <span aria-hidden="true">→</span>
        </button>
      </div>
    </nav>
  );
}
