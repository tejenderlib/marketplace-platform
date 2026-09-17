import { MEGA_NAV } from "../../data/megaMenu.js";

/**
 * CategoryNav: horizontal category strip. Hover/focus selects the active
 * menu (the single MegaMenu panel renders it); tap toggles on touch.
 * "Home" clears the marketplace filters via onHome.
 */
export default function CategoryNav({ activeId, saleType, onHover, onActivate, onSelectAuctions, onHome }) {
  return (
    <nav className="mega-nav" aria-label="Categories">
      <ul className="mega-nav-list">
        {MEGA_NAV.map((item) => {
          const isActive =
            item.kind === "home"
              ? activeId === null
              : item.kind === "auctions"
                ? saleType === "AUCTION"
                : activeId === item.id;
          return (
            <li key={item.id}>
              <button
                type="button"
                className={isActive ? "mega-nav-link is-active" : "mega-nav-link"}
                aria-current={isActive ? "true" : undefined}
                aria-expanded={item.kind === "menu" ? isActive : undefined}
                onMouseEnter={() => item.kind === "menu" && onHover(item.id)}
                onFocus={() => item.kind === "menu" && onHover(item.id)}
                onClick={() => {
                  if (item.kind === "home") onHome();
                  else if (item.kind === "auctions") onSelectAuctions();
                  else onActivate(item.id);
                }}
              >
                {item.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
