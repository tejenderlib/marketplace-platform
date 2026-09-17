/**
 * SiteHeader: two-row global marketplace header.
 *
 * Row 1 — brand · centered search (icon right) · Buy / Sell / Auctions /
 * Categories links · notification bell · account menu (real auth state).
 * Row 2 — category navigation with a hover mega menu (existing reusable
 * black MegaMenu panel + megaMenu.js data). All destinations are
 * existing hash routes or live search/category targets.
 */

import { useEffect, useRef, useState } from "react";

import AccountMenu from "../AccountMenu.jsx";
import Button from "../ui/Button.jsx";
import MegaMenu from "./MegaMenu.jsx";
import NotificationBell from "../NotificationBell.jsx";
import SearchField from "./SearchField.jsx";

function StrokeIcon({ children }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

function SofaIcon() {
  return (
    <StrokeIcon>
      <path d="M5 11V7.5A1.5 1.5 0 0 1 6.5 6h11A1.5 1.5 0 0 1 19 7.5V11" />
      <path d="M3.5 11.5A1.5 1.5 0 0 1 5 10h14a1.5 1.5 0 0 1 1.5 1.5V16h-17z" />
      <path d="M5 16v2.5M19 16v2.5" />
    </StrokeIcon>
  );
}

function ShirtIcon() {
  return (
    <StrokeIcon>
      <path d="M9 3.5L3.5 7l2 3.5 2-1V20a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1v-9.5l2 1 2-3.5z" />
    </StrokeIcon>
  );
}

function ChipIcon() {
  return (
    <StrokeIcon>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <path d="M9 2.5V6M15 2.5V6M9 18v3.5M15 18v3.5M2.5 9H6M2.5 15H6M18 9h3.5M18 15h3.5" />
    </StrokeIcon>
  );
}

function BookIcon() {
  return (
    <StrokeIcon>
      <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19v15H5.5A1.5 1.5 0 0 0 4 19.5z" />
      <path d="M4 19.5A1.5 1.5 0 0 1 5.5 18H19v3H5.5A1.5 1.5 0 0 1 4 19.5z" />
    </StrokeIcon>
  );
}

function GavelIcon() {
  return (
    <StrokeIcon>
      <path d="M9.5 4.5l5 5M7 7l7.5 7.5M12.5 12.5L20 20M3.5 20.5h6" />
      <path d="M5.5 3.5l3-1 5.5 5.5-1 3z" />
    </StrokeIcon>
  );
}

function ShieldIcon() {
  return (
    <StrokeIcon>
      <path d="M12 2.5l7.5 3v6c0 5-3.2 8.3-7.5 10-4.3-1.7-7.5-5-7.5-10v-6z" />
      <path d="M9 12l2 2 4-4.5" />
    </StrokeIcon>
  );
}

function GridIcon() {
  return (
    <StrokeIcon>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </StrokeIcon>
  );
}

function GemIcon() {
  return (
    <StrokeIcon>
      <path d="M7 3.5h10l4 5.5-9 11.5L3 9z" />
      <path d="M3 9h18M12 20.5L8.5 9l1-5.5M12 20.5l3.5-11.5 1-5.5" />
    </StrokeIcon>
  );
}

function BallIcon() {
  return (
    <StrokeIcon>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5l3 2.2-1.2 3.6h-3.6L9 9.7z" />
      <path d="M12 3.5v4M5 8.5l3.5 1.2M19 8.5l-3.5 1.2M6.5 18.5l2-3M17.5 18.5l-2-3" />
    </StrokeIcon>
  );
}

function BlocksIcon() {
  return (
    <StrokeIcon>
      <rect x="3.5" y="12.5" width="8" height="8" rx="1" />
      <rect x="12.5" y="12.5" width="8" height="8" rx="1" />
      <path d="M7.5 12.5V8.5h9v4M10 8.5V5h4v3.5" />
    </StrokeIcon>
  );
}

function CarIcon() {
  return (
    <StrokeIcon>
      <path d="M4 16v3M20 16v3M3 16h18" />
      <path d="M5 16l1.5-5A2 2 0 0 1 8.4 9.5h7.2a2 2 0 0 1 1.9 1.5L19 16" />
      <circle cx="8" cy="18.5" r="1.6" />
      <circle cx="16" cy="18.5" r="1.6" />
    </StrokeIcon>
  );
}

function DotsIcon() {
  return (
    <StrokeIcon>
      <circle cx="5.5" cy="12" r="1.3" />
      <circle cx="12" cy="12" r="1.3" />
      <circle cx="18.5" cy="12" r="1.3" />
    </StrokeIcon>
  );
}

/**
 * Row-2 navigation (reference order). `menuId` selects the hover mega
 * panel; entries without one are plain actions. Fashion and Home &
 * Living reuse the closest existing panels (clothing, furniture).
 */
const HEADER_NAV = [
  { id: "all", label: "All Categories", kind: "action", Icon: GridIcon },
  { id: "electronics", label: "Electronics", kind: "menu", menuId: "electronics", Icon: ChipIcon },
  { id: "fashion", label: "Fashion", kind: "menu", menuId: "clothing", Icon: ShirtIcon },
  { id: "home-living", label: "Home & Living", kind: "menu", menuId: "furniture", Icon: SofaIcon },
  { id: "collectibles", label: "Collectibles", kind: "menu", menuId: "collectibles", Icon: GemIcon },
  { id: "books", label: "Books", kind: "menu", menuId: "books", Icon: BookIcon },
  { id: "sports", label: "Sports", kind: "menu", menuId: "sports", Icon: BallIcon },
  { id: "toys", label: "Toys", kind: "menu", menuId: "toys", Icon: BlocksIcon },
  { id: "automotive", label: "Automotive", kind: "menu", menuId: "automotive", Icon: CarIcon },
  { id: "more", label: "More", kind: "more", Icon: DotsIcon },
];

function scrollToListings() {
  document
    .getElementById("listings")
    ?.scrollIntoView({ behavior: "auto", block: "start" });
}

// Small close delay so cursor travel between the nav row and the panel
// (and quick sweeps across items) never collapses the menu by accident.
const CLOSE_DELAY_MS = 140;

export default function SiteHeader({
  user,
  favoriteCount,
  cartCount = 0,
  onLogin,
  onOrders,
  onSell,
  onBuy,
  onLogout,
  categories,
  onSelectCategory,
  onAuctions,
  onClearFilters,
  query,
  onQueryChange,
}) {
  const displayName =
    user?.profile?.display_name ?? user?.email?.split("@")[0] ?? "Account";
  const searchRef = useRef(null);
  const zoneRef = useRef(null);
  const closeTimer = useRef(null);
  const [menuId, setMenuId] = useState(null);

  // ⌘K / Ctrl+K focuses the header search from anywhere on the page.
  useEffect(() => {
    function onKey(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        const tag = document.activeElement?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        event.preventDefault();
        searchRef.current?.querySelector("input")?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function cancelClose() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  function scheduleClose() {
    cancelClose();
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null;
      setMenuId(null);
    }, CLOSE_DELAY_MS);
  }

  useEffect(() => cancelClose, []);

  function openMenu(id) {
    cancelClose();
    setMenuId(id);
  }

  function toggleMenu(id) {
    cancelClose();
    // Tap toggles (touch); hover always selects.
    setMenuId((prev) => (prev === id ? null : id));
  }

  function handleHome() {
    cancelClose();
    setMenuId(null);
    if (onClearFilters) onClearFilters();
    window.scrollTo(0, 0);
  }

  function handleAuctions() {
    cancelClose();
    setMenuId(null);
    onAuctions();
  }

  function handleMore() {
    cancelClose();
    setMenuId(null);
    if (window.location.hash !== "#/buy") {
      window.location.hash = "#/buy";
    } else {
      scrollToListings();
    }
  }

  // Same target resolution as the catalogue discovery flow: category →
  // live backend match (or title+description search fallback), search →
  // GET /catalog/listings?q=, route → existing in-app hash.
  function handleExplore(target) {
    cancelClose();
    setMenuId(null);
    if (target.kind === "route") {
      window.location.hash = target.hash;
      return;
    }
    if (target.kind === "category") {
      const match = (categories ?? []).find(
        (category) => category.name.trim().toLowerCase() === target.name.trim().toLowerCase(),
      );
      if (match) {
        onQueryChange("");
        onSelectCategory(match.id);
        scrollToListings();
        return;
      }
    }
    onSelectCategory("All");
    onQueryChange(target.kind === "search" ? target.q : target.name);
    scrollToListings();
  }

  // Dismiss the panel: cursor leaves the nav+panel zone (after the delay),
  // page scrolls, pointer presses outside, or Escape. Moving between items
  // or between the nav row and the panel stays inside the zone, so the
  // menu never closes and reopens unnecessarily.
  useEffect(() => {
    if (!menuId) return undefined;
    let lastY = window.scrollY;
    let ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const y = window.scrollY;
        if (Math.abs(y - lastY) > 4) {
          cancelClose();
          setMenuId(null);
        }
        lastY = y;
      });
    }
    function onKey(event) {
      if (event.key === "Escape") {
        cancelClose();
        setMenuId(null);
      }
    }
    function onPointerDown(event) {
      if (zoneRef.current && !zoneRef.current.contains(event.target)) {
        cancelClose();
        setMenuId(null);
      }
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [menuId]);

  return (
    <header className="mp-header">
      <div className="mp-header-row">
        <a className="mp-brand" href="#/" aria-label="Marketplace home">
          Marketplace
        </a>

        <div className="mp-search" ref={searchRef}>
          <SearchField
            query={query}
            onQueryChange={onQueryChange}
            id="header-search"
            label="Search for items, brands, or categories"
            placeholder="Search for items, brands, or categories..."
            iconRight
          />
        </div>

        <nav className="mp-links" aria-label="Marketplace">
          <button type="button" className="mp-link" onClick={onBuy}>
            Buy
          </button>
          <button type="button" className="mp-link" onClick={onSell}>
            Sell
          </button>
          <button type="button" className="mp-link" onClick={handleAuctions}>
            Auctions
          </button>
          <a className="mp-link" href="#/buy">
            Categories
          </a>
        </nav>

        <div className="mp-actions">
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
        </div>
      </div>

      <div
        className="mp-menus"
        ref={zoneRef}
        onMouseLeave={scheduleClose}
        onMouseEnter={cancelClose}
      >
        <nav className="mp-catnav" aria-label="Categories">
          <ul>
            {HEADER_NAV.map((item) => {
              const Icon = item.Icon;
              const isOpen = menuId === item.menuId;
              if (item.kind === "action") {
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="mp-cat-link"
                      onClick={handleHome}
                      onMouseEnter={cancelClose}
                      onFocus={cancelClose}
                    >
                      <Icon />
                      <span>{item.label}</span>
                    </button>
                  </li>
                );
              }
              if (item.kind === "more") {
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="mp-cat-link"
                      onClick={handleMore}
                      onMouseEnter={cancelClose}
                      onFocus={cancelClose}
                    >
                      <Icon />
                      <span>{item.label}</span>
                    </button>
                  </li>
                );
              }
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={isOpen ? "mp-cat-link is-active" : "mp-cat-link"}
                    aria-current={isOpen ? "true" : undefined}
                    aria-expanded={isOpen}
                    onMouseEnter={() => openMenu(item.menuId)}
                    onFocus={() => openMenu(item.menuId)}
                    onClick={() => toggleMenu(item.menuId)}
                  >
                    <Icon />
                    <span>{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
        {menuId && (
          <MegaMenu
            menuId={menuId}
            onHover={openMenu}
            onExplore={handleExplore}
            onHome={handleHome}
          />
        )}
      </div>
    </header>
  );
}
