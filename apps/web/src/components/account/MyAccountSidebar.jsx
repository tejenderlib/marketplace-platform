function NavIcon({ children }) {
  return (
    <svg
      width="17"
      height="17"
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

function UserIcon() {
  return (
    <NavIcon>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </NavIcon>
  );
}

function ListIcon() {
  return (
    <NavIcon>
      <path d="M8.5 6h12M8.5 12h12M8.5 18h12" />
      <circle cx="4.5" cy="6" r="1.2" />
      <circle cx="4.5" cy="12" r="1.2" />
      <circle cx="4.5" cy="18" r="1.2" />
    </NavIcon>
  );
}

function BagIcon() {
  return (
    <NavIcon>
      <path d="M5.5 8h13l-1 12.5h-11z" />
      <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
    </NavIcon>
  );
}

function GavelIcon() {
  return (
    <NavIcon>
      <path d="M9.5 4.5l5 5M7 7l7.5 7.5M12.5 12.5L20 20M3.5 20.5h6" />
      <path d="M5.5 3.5l3-1 5.5 5.5-1 3z" />
    </NavIcon>
  );
}

function HeartIcon() {
  return (
    <NavIcon>
      <path d="M12 20.5S3.5 15.4 3.5 9.6A4.6 4.6 0 0 1 8.2 5c1.6 0 3 .9 3.8 2.2A4.6 4.6 0 0 1 15.8 5a4.6 4.6 0 0 1 4.7 4.6c0 5.8-8.5 10.9-8.5 10.9z" />
    </NavIcon>
  );
}

function GearIcon() {
  return (
    <NavIcon>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5 5l2.1 2.1M16.9 16.9L19 19M19 5l-2.1 2.1M7.1 16.9L5 19" />
    </NavIcon>
  );
}

function LogoutIcon() {
  return (
    <NavIcon>
      <path d="M14 4.5H5.5v15H14" />
      <path d="M10 12h11M18 8.5L21.5 12 18 15.5" />
    </NavIcon>
  );
}

const ITEMS = [
  { key: "Profile", label: "Profile", href: "#/account", Icon: UserIcon },
  { key: "My Listings", label: "My Listings", href: "#/account/listings", Icon: ListIcon },
  { key: "My Purchases", label: "My Purchases", href: "#/account/purchases", Icon: BagIcon },
  { key: "My Bids", label: "My Bids", href: "#/account/bids", Icon: GavelIcon },
  { key: "Saved Items", label: "Saved Items", href: "#/account/saved", Icon: HeartIcon },
  { key: "Account Settings", label: "Account Settings", href: "#/account/settings", Icon: GearIcon },
];

/**
 * MyAccountSidebar: account navigation over the new #/account/* routes.
 * "My Bids" maps to the sent-offers workspace, the closest existing
 * bidding/negotiation surface (no dedicated bids route exists).
 */
export default function MyAccountSidebar({ active = "Profile", onLogout, logoutDisabled }) {
  return (
    <aside className="myacct-sidebar" aria-label="My Account navigation">
      <h2 className="myacct-sidebar-title">My Account</h2>
      <nav aria-label="Account">
        <ul className="myacct-nav-list">
          {ITEMS.map((item) => (
            <li key={item.key}>
              <a
                className={active === item.key ? "myacct-link is-active" : "myacct-link"}
                aria-current={active === item.key ? "page" : undefined}
                href={item.href}
              >
                <item.Icon />
                <span>{item.label}</span>
              </a>
            </li>
          ))}
          <li>
            <button
              type="button"
              className="myacct-link"
              disabled={logoutDisabled}
              onClick={onLogout}
            >
              <LogoutIcon />
              <span>Logout</span>
            </button>
          </li>
        </ul>
      </nav>
    </aside>
  );
}
