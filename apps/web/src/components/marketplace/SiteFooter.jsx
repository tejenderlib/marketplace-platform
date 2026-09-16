/**
 * SiteFooter: restyled colophon with truthful copy (replaces the stale
 * "demo storefront with mock data" line). Links + Admin entry retained.
 */

export default function SiteFooter() {
  return (
    <footer className="ce-footer" id="colophon">
      <div className="ce-container ce-footer-inner">
        <div>
          <p className="ce-brand-name">Marketplace</p>
          <p className="ce-small ce-muted">
            Fixed-price finds, offers, and live auctions — published by
            sellers, moderated after listing. <a href="#/admin">Admin</a>
          </p>
        </div>
        <nav className="ce-footer-links" aria-label="Marketplace">
          <a href="#/notifications">Notifications</a>
          <a href="#/messages">Messages</a>
          <a href="#/reports">My Reports</a>
          <a href="#/support">Support</a>
        </nav>
      </div>
    </footer>
  );
}
