import { useState } from "react";
import { ROUTES } from "../../config/routes.js";

const NAV = [
  { label: "Home", href: ROUTES.home, active: true },
  { label: "Buy", href: ROUTES.buy, active: false },
  { label: "Sell", href: ROUTES.sell, active: false },
  { label: "How It Works", href: ROUTES.howItWorks, active: false },
];

export default function LandingHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="lp-header">
      <div className="lp-header-bar">
        <a className="lp-brand" href={ROUTES.home} aria-label="Marketplace home">
          [BRAND NAME]
        </a>

        <nav className="lp-nav" aria-label="Primary">
          {NAV.map((item) => (
            <a
              key={item.label}
              className={item.active ? "lp-nav-link is-active" : "lp-nav-link"}
              href={item.href}
              aria-current={item.active ? "page" : undefined}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="lp-header-actions">
          <a className="lp-icon-btn" href={ROUTES.buy} aria-label="Search products">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.6" />
              <path d="M13.5 13.5 17 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </a>
          <a className="lp-btn lp-btn--ghost" href={ROUTES.login}>
            Login
          </a>
          <a className="lp-btn lp-btn--solid" href={ROUTES.register}>
            Sign Up
          </a>
          <button
            type="button"
            className="lp-menu-btn"
            aria-expanded={open}
            aria-controls="lp-mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            <span aria-hidden="true" className="lp-menu-bars" />
          </button>
        </div>
      </div>

      <nav
        id="lp-mobile-menu"
        className={open ? "lp-mobile-menu is-open" : "lp-mobile-menu"}
        aria-label="Mobile"
      >
        {NAV.map((item) => (
          <a key={item.label} className="lp-mobile-link" href={item.href} onClick={() => setOpen(false)}>
            {item.label}
          </a>
        ))}
        <a className="lp-mobile-link" href={ROUTES.login} onClick={() => setOpen(false)}>
          Login
        </a>
        <a className="lp-mobile-link" href={ROUTES.register} onClick={() => setOpen(false)}>
          Sign Up
        </a>
      </nav>
    </header>
  );
}
