import { useEffect, useRef, useState } from "react";

import AccountMenu from "./AccountMenu.jsx";
import BrowseCategories from "./BrowseCategories.jsx";
import HeaderSearch from "./HeaderSearch.jsx";
import NotificationBell from "./NotificationBell.jsx";

/**
 * 3-zone marketplace header: left (brand + Browse Categories), center
 * (search, same state/behavior as the hero search), right (primary nav +
 * Sell accent + language + notifications + account). Tablet/mobile replace
 * the inline nav with a compact menu panel; all routes, handlers, auth,
 * and notification behavior are preserved.
 */
export default function Header({
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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const menuTriggerRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    function onDocClick(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) setMenuOpen(false);
    }
    function onKey(event) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuTriggerRef.current?.focus();
      }
    }
    function onHashChange() {
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
  }, [menuOpen]);

  function handleSell() {
    setMenuOpen(false);
    onSell();
  }

  // Mutual exclusion with the Browse Categories panel (both anchor under
  // the same header bar, so only one may be open at a time).
  useEffect(() => {
    function closeForBrowse() {
      setMenuOpen(false);
    }
    window.addEventListener("close-site-menu", closeForBrowse);
    return () => window.removeEventListener("close-site-menu", closeForBrowse);
  }, []);

  useEffect(() => {
    if (menuOpen) window.dispatchEvent(new CustomEvent("close-browse-menu"));
  }, [menuOpen]);

  return (
    <header className="site-header">
      <div className="header-bar">
        <div className="header-left">
          <a className="brand" href="#/" aria-label="Marketplace home">
            <span className="brand-mark" aria-hidden="true">
              M
            </span>
            <span className="brand-name">Marketplace</span>
          </a>

          <BrowseCategories
            categories={categories}
            active={activeCategory}
            onSelect={onSelectCategory}
            loading={categoriesLoading}
            error={categoriesError}
            onRetry={onCategoriesRetry}
            onViewAll={onViewAllAuctions}
          />
        </div>

        <HeaderSearch query={query} onQueryChange={onQueryChange} />

        <div className="header-right">
          <nav className="main-nav" aria-label="Primary">
            <button type="button" className="nav-link" onClick={onAuctions}>
              Auctions
            </button>
            <button type="button" className="nav-link" onClick={onBuy}>
              Buy
            </button>
            <a className="nav-link" href="#colophon">
              About
            </a>
            <a className="nav-link" href="#/support">
              Contacts
            </a>
          </nav>

          <button type="button" className="btn btn-sell header-sell" onClick={onSell}>
            Sell
          </button>

          <span className="lang" title="English">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M3 12h18M12 3c2.5 2.6 3.8 5.7 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3z" />
            </svg>
            <span aria-hidden="true">EN</span>
            <span className="visually-hidden">Language: English</span>
          </span>

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
            <button type="button" className="btn btn-primary header-login" onClick={onLogin}>
              Log In
            </button>
          )}

          <div className="mobile-menu-root" ref={menuRef}>
            <button
              type="button"
              ref={menuTriggerRef}
              className={menuOpen ? "menu-btn is-open" : "menu-btn"}
              aria-expanded={menuOpen}
              aria-controls="site-mobile-menu"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              onClick={() => setMenuOpen((value) => !value)}
            >
              <span aria-hidden="true" className="menu-bars" />
            </button>
            {menuOpen && (
              <nav
                id="site-mobile-menu"
                className="mobile-menu"
                aria-label="Site"
                onClick={() => setMenuOpen(false)}
              >
                <button type="button" className="mobile-link" onClick={onAuctions}>
                  Auctions
                </button>
                <button type="button" className="mobile-link" onClick={onBuy}>
                  Buy
                </button>
                <button type="button" className="btn btn-sell mobile-sell" onClick={handleSell}>
                  Sell
                </button>
                <a className="mobile-link" href="#colophon">
                  About
                </a>
                <a className="mobile-link" href="#/support">
                  Contacts
                </a>
              </nav>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
