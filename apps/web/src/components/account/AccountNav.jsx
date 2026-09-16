/**
 * Account navigation rail (desktop) / hub list (mobile). Every item is a
 * real hash link into the persistent workspace, so deep links, back/
 * forward, and right-click all work. Counts are real or omitted.
 */
const ITEMS = [
  { key: "overview", label: "Overview", href: "#/profile" },
  { key: "listings", label: "My Listings", href: "#/profile/listings" },
  { key: "offers", label: "Offers", href: "#/profile/offers" },
  { key: "orders", label: "Orders", href: "#/profile/orders" },
  { key: "favorites", label: "Favorites", href: "#/profile/favorites", count: "favorites" },
  { key: "messages", label: "Messages", href: "#/profile/messages" },
  { key: "notifications", label: "Notifications", href: "#/profile/notifications", count: "notifications" },
  { key: "reviews", label: "Reviews", href: "#/profile/reviews" },
  { key: "support", label: "Support", href: "#/profile/support" },
  { key: "settings", label: "Settings", href: "#/profile/settings" },
];

export default function AccountNav({ section, favoriteCount, notifUnread, onLogout }) {
  function countFor(item) {
    if (item.count === "favorites") return favoriteCount;
    if (item.count === "notifications") return notifUnread;
    return null;
  }

  return (
    <nav className="ce-acct-nav" aria-label="Account">
      <ul>
        {ITEMS.map((item) => {
          const active = section === item.key;
          const count = countFor(item);
          return (
            <li key={item.key}>
              <a
                className={active ? "ce-acct-link is-active" : "ce-acct-link"}
                aria-current={active ? "page" : undefined}
                href={item.href}
              >
                <span>{item.label}</span>
                {count != null && count > 0 ? (
                  <span className="ce-acct-count" aria-label={`${count} total`}>
                    {count > 99 ? "99+" : count}
                  </span>
                ) : null}
              </a>
            </li>
          );
        })}
        <li key="logout">
          <button type="button" className="ce-acct-link is-danger" onClick={onLogout}>
            <span>Sign Out</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
