import Button from "../ui/Button.jsx";

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

function TagIcon() {
  return (
    <NavIcon>
      <path d="M3.5 3.5h7L20 13a1.5 1.5 0 0 1 0 2l-5 5a1.5 1.5 0 0 1-2 0L3.5 10.5z" />
      <circle cx="8.5" cy="8.5" r="1.3" />
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

function GavelIcon() {
  return (
    <NavIcon>
      <path d="M9.5 4.5l5 5M7 7l7.5 7.5M12.5 12.5L20 20M3.5 20.5h6" />
      <path d="M5.5 3.5l3-1 5.5 5.5-1 3z" />
    </NavIcon>
  );
}

function ChatIcon() {
  return (
    <NavIcon>
      <path d="M21 12a8 8 0 0 1-8 8H4l1.6-3.2A8 8 0 1 1 21 12z" />
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

const NAV = [
  { label: "Sell an Item", href: "#/sell", active: true, Icon: TagIcon },
  { label: "My Listings", href: "#/profile/listings", Icon: ListIcon },
  { label: "My Bids", href: "#/profile/offers", Icon: GavelIcon },
  { label: "Messages", href: "#/profile/messages", Icon: ChatIcon },
  { label: "Favorites", href: "#/profile/favorites", Icon: HeartIcon },
  { label: "Settings", href: "#/profile/settings", Icon: GearIcon },
];

/**
 * SellerSidebar: seller navigation panel for the Sell Item page.
 * Links reuse existing hash routes only — "My Bids" maps to the
 * offers workspace, the closest existing bidding/negotiation surface.
 */
export default function SellerSidebar({ onCancel, cancelDisabled }) {
  return (
    <aside className="sell-sidebar" aria-label="Seller navigation">
      <nav aria-label="Seller">
        <ul className="sell-sidebar-list">
          {NAV.map((item) => (
            <li key={item.label}>
              <a
                className={item.active ? "sell-sidebar-link is-active" : "sell-sidebar-link"}
                aria-current={item.active ? "page" : undefined}
                href={item.href}
              >
                <item.Icon />
                <span>{item.label}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="sell-sidebar-foot">
        <Button variant="ghost" disabled={cancelDisabled} onClick={onCancel} block>
          Cancel
        </Button>
      </div>
    </aside>
  );
}
