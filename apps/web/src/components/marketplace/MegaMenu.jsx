import { MEGA_MENUS, MEGA_NAV } from "../../data/megaMenu.js";

/**
 * MegaMenu: ONE reusable black panel. Its content is fully derived from
 * `menuId` — moving between categories re-renders the same container,
 * never a stack of per-category panels.
 * Layout: left category list · center dynamic sections · right promo.
 */
export default function MegaMenu({ menuId, onHover, onExplore, onHome }) {
  const menu = menuId ? MEGA_MENUS[menuId] : null;
  if (!menu) return null;

  const navItems = MEGA_NAV.filter((item) => item.kind === "menu");

  return (
    <div className="mega-panel">
      <div className="mega-panel-left">
        <p className="mega-panel-kicker">Browse</p>
        <ul className="mega-panel-cats">
          {navItems.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={item.id === menuId ? "mega-cat is-active" : "mega-cat"}
                aria-current={item.id === menuId ? "true" : undefined}
                onMouseEnter={() => onHover(item.id)}
                onFocus={() => onHover(item.id)}
                onClick={() => onHover(item.id)}
              >
                {item.label}
                <span aria-hidden="true">→</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="mega-panel-center" key={menuId}>
        <p className="mega-panel-kicker">{menu.title}</p>
        <p className="mega-panel-tagline">{menu.tagline}</p>
        <div className="mega-sections">
          {menu.sections.map((section) => (
            <div key={section.heading} className="mega-section">
              <h3>{section.heading}</h3>
              <ul>
                {section.links.map((link) => (
                  <li key={link.label}>
                    <button
                      type="button"
                      className="mega-link"
                      onClick={() => onExplore(link.target, link.label)}
                    >
                      {link.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="mega-panel-right" aria-hidden="false">
        <p className="mega-panel-kicker">Featured</p>
        <p className="mega-promo-title">{menu.title}</p>
        <p className="mega-promo-sub">{menu.tagline}</p>
        <button
          type="button"
          className="mega-promo-cta"
          onClick={() => onExplore(menu.explore, menu.title)}
        >
          Explore {menu.title} →
        </button>
      </div>

      <div className="mega-panel-home">
        <button type="button" className="mega-home-link" onClick={onHome}>
          ← Back to all listings
        </button>
      </div>
    </div>
  );
}
