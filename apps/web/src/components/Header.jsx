import NotificationBell from "./NotificationBell.jsx";

export default function Header({
  query,
  onQueryChange,
  user,
  favoriteCount,
  onLogin,
  onOrders,
  onSell,
  onLogout,
}) {
  const displayName =
    user?.profile?.display_name ?? user?.email?.split("@")[0] ?? "Account";

  return (
    <header className="site-header">
      <div className="header-inner">
        <a className="brand" href="#" onClick={(e) => e.preventDefault()}>
          <span className="brand-mark" aria-hidden="true">
            M
          </span>
          <span className="brand-name">Marketplace</span>
        </a>

        <div className="header-search" role="search">
          <input
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search listings, categories, locations…"
            aria-label="Search listings"
          />
        </div>

        <nav className="header-actions" aria-label="Account">
          <span className="fav-count" title="Saved favorites">
            ♥ {favoriteCount}
          </span>
          {user ? (
            <>
              <a className="user-chip" title={user.email} href="#/profile">
                {displayName}
              </a>
              <a className="btn btn-ghost" href="#/favorites">
                Favorites
              </a>
              <a className="btn btn-ghost" href="#/offers">
                My Offers
              </a>
              <a className="btn btn-ghost" href="#/seller/offers">
                Seller Offers
              </a>
              <a className="btn btn-ghost" href="#/messages">
                Messages
              </a>
              <NotificationBell />
              <button type="button" className="btn btn-ghost" onClick={onOrders}>
                My Orders
              </button>
              <button type="button" className="btn btn-ghost" onClick={onLogout}>
                Logout
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-ghost" onClick={onLogin}>
              Login
            </button>
          )}
          <button type="button" className="btn btn-sell" onClick={onSell}>
            Sell +
          </button>
        </nav>
      </div>
    </header>
  );
}
