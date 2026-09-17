/**
 * SiteFooter: premium dark marketplace footer (monochrome only).
 * Brand + SUPPORT / ACCOUNT / RESOURCES columns + legal bar.
 * LINK HONESTY: only existing in-app routes are <a> links.
 * Destinations that do not exist yet render as muted non-interactive
 * text (never a fake href). No social buttons: the project has no
 * social accounts, so none are invented. No BUY/SELL columns by design.
 */

function SupportLinks() {
  return (
    <ul className="mf-links">
      <li><span className="mf-future">Help Center</span></li>
      <li><span className="mf-future">Contact Us</span></li>
      <li><a href="#/support">Raise a Ticket</a></li>
      <li><span className="mf-future">FAQs</span></li>
      <li><a href="#/support">Support</a></li>
    </ul>
  );
}

function AccountLinks({ user, onLogout }) {
  return (
    <ul className="mf-links">
      <li><a href="#/profile">My Profile</a></li>
      <li><a href="#/orders">My Orders</a></li>
      <li><a href="#/profile/favorites">Favorites</a></li>
      <li><a href="#/profile/settings">Settings</a></li>
      <li>
        {user ? (
          <button type="button" className="mf-link-btn" onClick={onLogout}>
            Logout
          </button>
        ) : (
          <a href="#/login">Login</a>
        )}
      </li>
    </ul>
  );
}

function ResourceLinks() {
  return (
    <ul className="mf-links">
      <li><span className="mf-future">Blogs</span></li>
      <li><span className="mf-future">Documentation</span></li>
      <li><span className="mf-future">Community</span></li>
      <li><span className="mf-future">Guides</span></li>
      <li><span className="mf-future">Sitemap</span></li>
    </ul>
  );
}

function Column({ id, title, children }) {
  return (
    <div className="mf-col">
      <h2 className="mf-heading" id={id}>
        {title}
      </h2>
      <div className="mf-col-body">{children}</div>
      <details className="mf-acc">
        <summary aria-label={`${title} navigation`}>{title}</summary>
        {children}
      </details>
    </div>
  );
}

function Backdrop() {
  return (
    <div className="mf-backdrop" aria-hidden="true">
      <svg className="mf-waves" viewBox="0 0 1440 420" preserveAspectRatio="xMidYMax slice">
        <defs>
          <pattern id="mf-dots" width="22" height="22" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.3" fill="#3a3a3a" />
          </pattern>
          <filter id="mf-grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
        </defs>
        <rect x="0" y="0" width="1440" height="420" fill="none" />
        <path d="M0 250 C 240 200, 420 290, 720 240 S 1200 190, 1440 240 L1440 420 L0 420 Z" fill="#1b1b1b" />
        <path d="M0 290 C 260 240, 480 330, 760 285 S 1220 235, 1440 285 L1440 420 L0 420 Z" fill="#242424" />
        <path d="M0 330 C 280 285, 520 365, 800 325 S 1240 280, 1440 330 L1440 420 L0 420 Z" fill="#2e2e2e" />
        <path d="M0 372 C 300 335, 560 395, 840 365 S 1260 330, 1440 368 L1440 420 L0 420 Z" fill="#3a3a3a" />
        <rect x="0" y="0" width="180" height="420" fill="url(#mf-dots)" opacity="0.5" />
        <rect x="1260" y="0" width="180" height="420" fill="url(#mf-dots)" opacity="0.5" />
        <rect x="0" y="0" width="1440" height="420" filter="url(#mf-grain)" opacity="0.06" />
      </svg>
      <span className="mf-wordmark">MarketPlace</span>
    </div>
  );
}

export default function SiteFooter({ user, onLogout }) {
  function backToTop() {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
  }

  return (
    <footer className="mf-footer">
      <div className="mf-shell" id="colophon">
        <Backdrop />
        <div className="mf-inner">
        <div className="mf-main">
          <div className="mf-brand">
            <p className="mf-brand-row">
              <span className="mf-brand-mark" aria-hidden="true">
                M
              </span>
              <span className="mf-brand-name">MarketPlace</span>
            </p>
            <p className="mf-tagline">
              Find what you need.
              <br />
              Sell what you don&rsquo;t.
            </p>
            <p className="mf-community">Join our community for updates, tips and more.</p>
          </div>
          <nav className="mf-cols" aria-label="Footer">
            <Column id="mf-support" title="Support">
              <SupportLinks />
            </Column>
            <Column id="mf-account" title="Account">
              <AccountLinks user={user} onLogout={onLogout} />
            </Column>
            <Column id="mf-resources" title="Resources">
              <ResourceLinks />
            </Column>
          </nav>
        </div>
        <div className="mf-bottom">
          <p className="mf-copy">© 2026 MarketPlace. All rights reserved.</p>
          <div className="mf-legal">
            <span className="mf-future">Privacy Policy</span>
            <span className="mf-sep" aria-hidden="true">|</span>
            <span className="mf-future">Terms &amp; Conditions</span>
            <span className="mf-sep" aria-hidden="true">|</span>
            <span className="mf-future">Cookies</span>
            <button
              type="button"
              className="mf-top"
              onClick={backToTop}
              aria-label="Back to top"
              title="Back to top"
            >
              <span aria-hidden="true">↑</span>
            </button>
          </div>
        </div>
        </div>
      </div>
    </footer>
  );
}
