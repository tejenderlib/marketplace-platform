import { useCallback, useEffect, useState } from "react";

import { ApiError } from "../api/client.js";
import { myOrders } from "../api/checkout.js";
import { myOffers } from "../api/offers.js";
import { myListings } from "../api/seller.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { useAuthedImageUrl } from "../components/sell/PhotoThumb.jsx";
import Button from "../components/ui/Button.jsx";
import { EmptyState } from "../components/ui/States.jsx";
import EditProfileModal, { avatarColor } from "../components/account/EditProfileModal.jsx";
import MyAccountSidebar from "../components/account/MyAccountSidebar.jsx";

function timeAgo(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "—";
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  return date.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

function formatMemberSince(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

function ActionIcon({ children }) {
  return (
    <svg
      width="20"
      height="20"
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

const QUICK_ACTIONS = [
  {
    href: "#/sell",
    title: "Create a Listing",
    desc: "Start selling an item",
    icon: (
      <ActionIcon>
        <path d="M3.5 3.5h7L20 13a1.5 1.5 0 0 1 0 2l-5 5a1.5 1.5 0 0 1-2 0L3.5 10.5z" />
        <circle cx="8.5" cy="8.5" r="1.3" />
      </ActionIcon>
    ),
  },
  {
    href: "#/account/bids",
    title: "View My Bids",
    desc: "Track your auction activity",
    icon: (
      <ActionIcon>
        <path d="M9.5 4.5l5 5M7 7l7.5 7.5M12.5 12.5L20 20M3.5 20.5h6" />
        <path d="M5.5 3.5l3-1 5.5 5.5-1 3z" />
      </ActionIcon>
    ),
  },
  {
    href: "#/account/purchases",
    title: "My Purchases",
    desc: "See your order history",
    icon: (
      <ActionIcon>
        <path d="M5.5 8h13l-1 12.5h-11z" />
        <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
      </ActionIcon>
    ),
  },
  {
    href: "#/account/saved",
    title: "Saved Items",
    desc: "View your wishlist",
    icon: (
      <ActionIcon>
        <path d="M12 20.5S3.5 15.4 3.5 9.6A4.6 4.6 0 0 1 8.2 5c1.6 0 3 .9 3.8 2.2A4.6 4.6 0 0 1 15.8 5a4.6 4.6 0 0 1 4.7 4.6c0 5.8-8.5 10.9-8.5 10.9z" />
      </ActionIcon>
    ),
  },
];

function ActivityThumb({ row }) {
  const { url, broken } = useAuthedImageUrl(
    row.listingId ?? null,
    row.imageId ?? null,
  );
  if (row.listingId && row.imageId && url && !broken) {
    return <img src={url} alt="" className="myacct-thumb-img" aria-hidden="true" />;
  }
  return (
    <span className="myacct-thumb-mono" aria-hidden="true">
      {(row.title ?? "?").trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

/**
 * My Account dashboard for the authenticated user. Identity comes from
 * the session (/auth/me); stats and activity are computed from live
 * user-scoped endpoints (listings, orders, pending offers, favorites).
 * "Active Bids" counts PENDING offers — the closest existing
 * negotiation surface (no aggregate bids endpoint exists).
 */
export default function MyAccountPage() {
  const { user, authFetch, logout, reloadUser } = useAuth();
  const [stats, setStats] = useState({ listings: null, sold: null, bids: null, saved: null });
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [listings, sold, bids, favorites, recentListings, orders, offers] = await Promise.all([
      myListings(authFetch, { limit: 1 }).catch(() => null),
      myListings(authFetch, { status: "SOLD", limit: 1 }).catch(() => null),
      myOffers(authFetch, { status: "PENDING", limit: 1 }).catch(() => null),
      authFetch("/catalog/favorites").catch(() => null),
      myListings(authFetch, { limit: 3 }).catch(() => null),
      myOrders(authFetch, { limit: 3 }).catch(() => null),
      myOffers(authFetch, { limit: 3 }).catch(() => null),
    ]);
    setStats({
      listings: listings?.total ?? null,
      sold: sold?.total ?? null,
      bids: bids?.total ?? null,
      saved: Array.isArray(favorites) ? favorites.length : null,
    });
    const rows = [];
    for (const item of recentListings?.items ?? []) {
      rows.push({
        key: `listing-${item.id}`,
        title: item.title,
        desc: `Listed for sale · ${item.status}`,
        time: item.created_at,
        href: "#/account/listings",
        listingId: item.id,
        imageId: item.images?.[0]?.id ?? null,
      });
    }
    for (const order of orders?.items ?? []) {
      rows.push({
        key: `order-${order.id}`,
        title: order.listing_title_snapshot ?? "Order",
        desc: `Purchased · ${order.status}`,
        time: order.created_at,
        href: `#/orders/${order.id}`,
        listingId: null,
        imageId: null,
      });
    }
    for (const offer of offers?.items ?? []) {
      rows.push({
        key: `offer-${offer.id}`,
        title: "Offer",
        desc: `Offer ${String(offer.status ?? "").toLowerCase() || "placed"}`,
        time: offer.created_at,
        href: "#/account/bids",
        listingId: null,
        imageId: null,
      });
    }
    for (const fav of (Array.isArray(favorites) ? favorites : []).slice(0, 3)) {
      rows.push({
        key: `fav-${fav.listing_id}`,
        title: fav.listing?.title ?? "Saved item",
        desc: "Saved to wishlist",
        time: fav.created_at,
        href: fav.listing_id ? `#/listing/${fav.listing_id}` : "#/account/saved",
        listingId: fav.listing_id,
        imageId: fav.listing?.images?.[0]?.id ?? null,
      });
    }
    rows.sort((a, b) => new Date(b.time ?? 0) - new Date(a.time ?? 0));
    setActivity(rows.slice(0, 6));
    setLoading(false);
  }, [authFetch]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
      window.location.hash = "#/";
    }
  }

  async function handleSaveProfile(body) {
    await authFetch("/users/me/profile", { method: "PATCH", body });
    await reloadUser();
    setEditOpen(false);
    setNotice("Profile updated.");
    load();
  }

  const profile = user?.profile ?? {};
  const email = user?.email ?? "—";
  const fullName =
    profile.display_name ??
    [profile.first_name, profile.last_name].filter(Boolean).join(" ") ??
    "";
  const displayName = fullName.trim() !== "" ? fullName : email.split("@")[0] ?? "Account";
  const memberSince = formatMemberSince(user?.created_at);

  const statItems = [
    { label: "Total Listings", value: stats.listings },
    { label: "Items Sold", value: stats.sold },
    { label: "Active Bids", value: stats.bids },
    { label: "Saved Items", value: stats.saved },
  ];

  return (
    <div className="ce-scope myacct">
      <div className="myacct-body">
        <div className="myacct-head">
          <h1>My Account</h1>
          <p>Manage your profile, listings, purchases and account settings.</p>
        </div>
        {notice && (
          <p className="ce-ok" role="status">
            {notice}
          </p>
        )}

        <div className="myacct-layout">
          <MyAccountSidebar onLogout={handleLogout} logoutDisabled={loggingOut} />

          <div className="myacct-main">
            <section className="myacct-summary" aria-label="Profile summary">
              <div className="myacct-identity">
                <button
                  type="button"
                  className="myacct-avatar-wrap"
                  onClick={() => setEditOpen(true)}
                  aria-label="Edit profile photo"
                >
                  <span
                    className="myacct-avatar myacct-avatar--lg"
                    style={avatarColor(profile.avatar_url) ? { background: avatarColor(profile.avatar_url) } : undefined}
                    aria-hidden="true"
                  >
                    {displayName.trim().charAt(0).toUpperCase() || "?"}
                  </span>
                  <span className="myacct-avatar-edit" aria-hidden="true">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 20h4l11-11-4-4L4 16z" />
                      <path d="M13.5 6.5l4 4" />
                    </svg>
                  </span>
                </button>
                <div className="myacct-identity-text">
                  <h2>{displayName}</h2>
                  <p className="myacct-bio">{profile.bio?.trim() || "—"}</p>
                  <dl className="myacct-facts">
                    <div>
                      <dt>Email</dt>
                      <dd>{email}</dd>
                    </div>
                    <div>
                      <dt>Phone</dt>
                      <dd>—</dd>
                    </div>
                    <div>
                      <dt>Location</dt>
                      <dd>—</dd>
                    </div>
                    <div>
                      <dt>Member since</dt>
                      <dd>{memberSince}</dd>
                    </div>
                  </dl>
                </div>
              </div>
              <div className="myacct-side">
                <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
                  Edit Profile
                </Button>
                <dl className="myacct-stats">
                  {statItems.map((item) => (
                    <div key={item.label} className="myacct-stat">
                      <dd>{item.value ?? (loading ? "…" : "—")}</dd>
                      <dt>{item.label}</dt>
                    </div>
                  ))}
                </dl>
              </div>
            </section>

            <section aria-labelledby="myacct-actions-heading">
              <h2 id="myacct-actions-heading" className="myacct-section-title">
                Quick Actions
              </h2>
              <ul className="myacct-actions">
                {QUICK_ACTIONS.map((action) => (
                  <li key={action.title}>
                    <a className="myacct-action-card" href={action.href}>
                      <span className="myacct-action-icon" aria-hidden="true">
                        {action.icon}
                      </span>
                      <span className="myacct-action-text">
                        <strong>{action.title}</strong>
                        <span>{action.desc}</span>
                      </span>
                      <span className="myacct-action-arrow" aria-hidden="true">→</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>

            <hr className="myacct-divider" />

            <section aria-labelledby="myacct-activity-heading">
              <div className="myacct-section-head">
                <h2 id="myacct-activity-heading" className="myacct-section-title">
                  Recent Activity
                </h2>
                <a className="myacct-view-all" href="#/account/purchases">
                  View All →
                </a>
              </div>
              {loading ? (
                <p className="ce-small ce-muted" role="status">Loading activity…</p>
              ) : activity.length === 0 ? (
                <EmptyState
                  title="No activity yet"
                  hint="Your bids, purchases, saves and listings will appear here."
                  action={
                    <Button variant="primary" size="sm" href="#/sell">
                      Create a listing
                    </Button>
                  }
                />
              ) : (
                <ul className="myacct-activity">
                  {activity.map((row) => (
                    <li key={row.key}>
                      <a className="myacct-activity-row" href={row.href}>
                        <span className="myacct-thumb" aria-hidden="true">
                          <ActivityThumb row={row} />
                        </span>
                        <span className="myacct-activity-text">
                          <strong>{row.title}</strong>
                          <span>{row.desc}</span>
                        </span>
                        <span className="myacct-activity-time">{timeAgo(row.time)}</span>
                        <span className="myacct-action-arrow" aria-hidden="true">→</span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </div>

      {editOpen && (
        <EditProfileModal
          user={user}
          memberSince={memberSince}
          onClose={() => setEditOpen(false)}
          onSaved={handleSaveProfile}
        />
      )}
    </div>
  );
}
