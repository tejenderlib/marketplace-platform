/**
 * SiteHeader: Curated Exchange masthead. Same props, routes, handlers, and
 * auth lifecycle as the legacy Header; new presentation only.
 * Categories flow through the existing onSelectCategory(id) contract via
 * the shared CategoryDirectory source.
 */

import { useEffect, useRef, useState } from "react";

import AccountMenu from "../AccountMenu.jsx";
import NotificationBell from "../NotificationBell.jsx";
import Button from "../ui/Button.jsx";
import CategoryDirectory from "./CategoryDirectory.jsx";
import SearchField from "./SearchField.jsx";

export default function SiteHeader({
  user,
  favoriteCount,
  onLogin,
  onOrders,
  onSell,
  onAuctions,
  onBuy,
  onLogout,
  categories,
  activeCategory,
  onSelectCategory,
  categoriesLoading,
  categoriesError,
  onCategoriesRetry,
  onViewAllAuctions,
  query,
  onQueryChange,
}) {
  const displayName =
    user?.profile?.display_name ?? user?.email?.split("@")[0] ?? "Account";
  const [catsOpen, setCatsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const catsRef = useRef(null);
  const menuTriggerRef = useRef(null);

  function closeMenus() {
    setCatsOpen(false);
    setMenuOpen(false);
  }

  function handleSell() {
    closeMenus();
    onSell();
  }

  function handleSelect(id) {
    setCatsOpen(false);
    setMenuOpen(false);
    onSelectCategory(id);
  }

  useEffect(() => {
    if (!catsOpen && !menuOpen) return undefined;
    function onDocClick(event) {
      if (catsOpen && catsRef.current && !catsRef.current.contains(event.target)) {
        setCatsOpen(false);
      }
    }
    function onKey(event) {
      if (event.key === "Escape") {
        setCatsOpen(false);
        setMenuOpen(false);
        menuTriggerRef.current?.focus();
      }
    }
    function onHashChange() {
      setCatsOpen(false);
      setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener("hashchange", onHashChange);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("hashchange", onHashChange);
    };
  }, [catsOpen, menuOpen]);

  return (
    <header className="ce-masthead">
      <div className="ce-container ce-masthead-bar">
        <div className="ce-masthead-left">
          <a className="ce-brand" href="#/" aria-label="Marketplace home">
            <span className="ce-brand-mark" aria-hidden="true">
              M
            </span>
            <span className="ce-brand-name">Marketplace</span>
          </a>
          <div className="ce-cats" ref={catsRef}>
            <button
              type="button"
              className={catsOpen ? "ce-cats-trigger is-open" : "ce-cats-trigger"}
              aria-expanded={catsOpen}
              aria-controls="ce-cats-panel"
              onClick={() => {
                setMenuOpen(false);
                setCatsOpen((value) => !value);
              }}
            >
              Categories
              <span aria-hidden="true" className={catsOpen ? "ce-caret is-open" : "ce-caret"}>
                ▾
              </span>
            </button>
            {catsOpen && (
              <div id="ce-cats-panel" className="ce-cats-panel" role="dialog" aria-label="Browse categories">
                <CategoryDirectory
                  categories={categories}
                  active={activeCategory}
                  onSelect={handleSelect}
                  loading={categoriesLoading}
                  error={categoriesError}
                  onRetry={onCategoriesRetry}
                  compact
                />
                <div className="ce-cats-foot">
                  <button type="button" className="ce-btn ce-btn--ghost ce-btn--sm" onClick={() => { closeMenus(); onSelectCategory("All"); }}>
                    Browse everything
                  </button>
                  <button type="button" className="ce-btn ce-btn--ghost ce-btn--sm" onClick={() => { closeMenus(); onViewAllAuctions(); }}>
                    View all auctions
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="ce-masthead-search">
          <SearchField query={query} onQueryChange={onQueryChange} id="header-search" label="Search listings from the header" />
        </div>

        <div className="ce-masthead-right">
          <nav className="ce-nav" aria-label="Primary">
            <button type="button" className="ce-nav-link" onClick={onAuctions}>
              Auctions
            </button>
            <button type="button" className="ce-nav-link" onClick={onBuy}>
              Fixed price
            </button>
            <a className="ce-nav-link" href="#/support">
              Support
            </a>
          </nav>
          <Button variant="primary" size="sm" onClick={handleSell}>
            Sell
          </Button>
          <NotificationBell />
          {user ? (
            <AccountMenu
              user={user}
              displayName={displayName}
              favoriteCount={favoriteCount}
              onOrders={onOrders}
              onLogout={onLogout}
            />
          ) : (
            <Button variant="secondary" size="sm" onClick={onLogin}>
              Log In
            </Button>
          )}
          <button
            type="button"
            ref={menuTriggerRef}
            className={menuOpen ? "ce-menu-btn is-open" : "ce-menu-btn"}
            aria-expanded={menuOpen}
            aria-controls="ce-mobile-menu"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => {
              setCatsOpen(false);
              setMenuOpen((value) => !value);
            }}
          >
            <span aria-hidden="true" className="ce-menu-bars" />
          </button>
        </div>
      </div>

      <div className="ce-container ce-masthead-search--mobile">
        <SearchField query={query} onQueryChange={onQueryChange} id="header-search-mobile" label="Search listings" />
      </div>

      {menuOpen && (
        <div className="ce-sheet-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) setMenuOpen(false); }}>
          <nav id="ce-mobile-menu" className="ce-sheet" aria-label="Site">
            <div className="ce-sheet-head">
              <span className="ce-h3">Menu</span>
              <button
                type="button"
                className="ce-btn ce-btn--ghost ce-btn--sm"
                onClick={() => {
                  setMenuOpen(false);
                  menuTriggerRef.current?.focus();
                }}
                aria-label="Close menu"
              >
                ✕
              </button>
            </div>
            <button type="button" className="ce-sheet-link" onClick={() => { closeMenus(); onAuctions(); }}>
              Auctions
            </button>
            <button type="button" className="ce-sheet-link" onClick={() => { closeMenus(); onBuy(); }}>
              Fixed price
            </button>
            <button type="button" className="ce-sheet-link ce-sheet-link--strong" onClick={handleSell}>
              Sell an item
            </button>
            <a className="ce-sheet-link" href="#/support" onClick={closeMenus}>
              Support
            </a>
            <a className="ce-sheet-link" href="#colophon" onClick={closeMenus}>
              About
            </a>
            <div className="ce-sheet-cats">
              <p className="ce-micro ce-muted">Browse categories</p>
              <CategoryDirectory
                categories={categories}
                active={activeCategory}
                onSelect={handleSelect}
                loading={categoriesLoading}
                error={categoriesError}
                onRetry={onCategoriesRetry}
                compact
              />
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
