import { useEffect, useRef, useState } from "react";

import CategoryMegaMenu from "./CategoryMegaMenu.jsx";

/**
 * Header "Browse Categories" trigger + large white mega-menu panel.
 *
 * Click toggles the directory panel anchored under the header bar
 * (the .browse-root is position-static; .category-mega positions against
 * .header-bar). Closes on outside click, Escape, or category selection.
 * Arrow keys move focus across directory links. Selection flows through
 * the existing `onSelect(categoryId)` contract, so filtering behavior
 * is unchanged.
 */
export default function BrowseCategories({
  categories,
  active,
  onSelect,
  loading,
  error,
  onRetry,
  onViewAll,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function onDocClick(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    }
    function onKey(event) {
      if (event.key !== "Escape") return;
      // Only close when focus is inside the menu, so Escape while typing
      // in the header search is not swallowed by this menu.
      if (
        panelRef.current?.contains(document.activeElement) ||
        rootRef.current?.contains(document.activeElement)
      ) {
        setOpen(false);
      }
    }
    function onArrowKeys(event) {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const panel = panelRef.current;
      if (!panel || !panel.contains(document.activeElement)) return;
      const links = [...panel.querySelectorAll(".catdir-link, .catdir-heading")].filter(
        (el) => el.offsetParent !== null,
      );
      const index = links.indexOf(document.activeElement);
      if (index === -1) return;
      event.preventDefault();
      const next =
        event.key === "ArrowDown"
          ? (index + 1) % links.length
          : (index - 1 + links.length) % links.length;
      links[next].focus();
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    document.addEventListener("keydown", onArrowKeys);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("keydown", onArrowKeys);
    };
  }, [open]);

  // Mutual exclusion with the header mobile menu (both anchor under the
  // same header bar, so only one may be open at a time).
  useEffect(() => {
    function closeForMenu() {
      setOpen(false);
    }
    window.addEventListener("close-browse-menu", closeForMenu);
    return () => window.removeEventListener("close-browse-menu", closeForMenu);
  }, []);

  useEffect(() => {
    if (open) window.dispatchEvent(new CustomEvent("close-site-menu"));
  }, [open]);

  // Focus the first directory link when the panel is opened via keyboard.
  useEffect(() => {
    if (open) {
      if (rootRef.current?.querySelector(".browse-trigger") === document.activeElement) {
        const first = panelRef.current?.querySelector(".catdir-heading, .catdir-link");
        if (first) first.focus();
      }
    }
  }, [open]);

  function handleSelect(id) {
    onSelect(id);
    setOpen(false);
  }

  // Native button click already toggles on Enter/Space; only ArrowDown
  // needs a custom handler to open the panel from the keyboard.
  function handleTriggerKeyDown(event) {
    if (event.key === "ArrowDown" && !open) {
      event.preventDefault();
      setOpen(true);
    }
  }

  return (
    <div className="browse-root" ref={rootRef} data-category-menu-root>
      <button
        type="button"
        className={open ? "browse-trigger is-open" : "browse-trigger"}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={handleTriggerKeyDown}
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls="browse-categories-panel"
      >
        <span className="browse-grid-icon" aria-hidden="true">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
            <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
            <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
            <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
          </svg>
        </span>
        <span>Browse Categories</span>
        <span className={open ? "browse-caret is-open" : "browse-caret"} aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div
          id="browse-categories-panel"
          ref={panelRef}
          className="category-mega"
          role="dialog"
          aria-label="Browse categories"
        >
          <CategoryMegaMenu
            categories={categories}
            active={active}
            onSelect={handleSelect}
            loading={loading}
            error={error}
            onRetry={onRetry}
            onViewAll={
              onViewAll
                ? () => {
                    onViewAll();
                    setOpen(false);
                  }
                : undefined
            }
          />
        </div>
      )}
    </div>
  );
}
