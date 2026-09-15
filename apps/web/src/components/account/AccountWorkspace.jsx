import { useEffect, useState } from "react";

import { useAuth } from "../../auth/AuthContext.jsx";
import { unreadCount } from "../../api/notifications.js";
import ReviewsSection from "../ReviewsSection.jsx";
import BuyerOffersPage from "../../pages/BuyerOffers.jsx";
import SellerOffersPage from "../../pages/SellerOffers.jsx";
import FavoritesPage from "../../pages/Favorites.jsx";
import MessagesPage from "../../pages/Messages.jsx";
import NotificationsPage from "../../pages/NotificationsPage.jsx";
import { OrdersPage, OrderDetailPage } from "../../pages/Orders.jsx";
import SupportPage from "../../pages/Support.jsx";
import SupportDetailPage from "../../pages/SupportDetail.jsx";
import AccountListings from "./AccountListings.jsx";
import AccountNav from "./AccountNav.jsx";
import AccountOverview from "./AccountOverview.jsx";
import AccountSettings from "./AccountSettings.jsx";

/**
 * Persistent Account Workspace shell: compact identity header, always-
 * visible navigation rail, and a main area that swaps section content.
 * Sections reuse the existing page components verbatim — nothing is
 * reimplemented. Legacy standalone URLs render the same shell, so old
 * links and bookmarks keep working.
 */
export default function AccountWorkspace({
  section,
  offersTab = "sent",
  orderId = null,
  ticketId = null,
  favorites,
  onToggleFavorite,
  favoriteCount = 0,
}) {
  const { isAuthenticated, authFetch, redirectToLogin, logout, user } = useAuth();
  const [notifUnread, setNotifUnread] = useState(null);
  const [tab, setTab] = useState(offersTab);

  useEffect(() => {
    setTab(offersTab);
  }, [offersTab]);

  useEffect(() => {
    if (!isAuthenticated) {
      redirectToLogin();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let alive = true;
    unreadCount(authFetch)
      .then((data) => {
        if (alive && data && typeof data.count === "number") setNotifUnread(data.count);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [isAuthenticated, authFetch]);

  async function handleLogout() {
    await logout();
    window.location.hash = "#/";
  }

  if (!isAuthenticated) {
    return (
      <div className="content">
        <p className="muted">Redirecting to login…</p>
      </div>
    );
  }

  const displayName = user?.profile?.display_name ?? user?.email?.split("@")[0] ?? "Account";

  return (
    <div className="content acct-page">
      <div className="acct-identity">
        <span className="acct-avatar" aria-hidden="true">
          {displayName.charAt(0).toUpperCase()}
        </span>
        <div className="acct-identity-text">
          <p className="co-eyebrow">Account</p>
          <h1>{displayName}</h1>
          <p className="muted small">{user?.email}</p>
        </div>
        <div className="acct-identity-actions">
          <span className="pill">{user?.status}</span>
          <a className="btn btn-ghost btn-sm" href="#/profile/settings">
            Edit profile
          </a>
        </div>
      </div>

      <div className="acct-layout">
        <div className={section === "overview" ? "acct-rail" : "acct-rail acct-rail-collapsed"}>
          <AccountNav
            section={section}
            favoriteCount={favoriteCount}
            notifUnread={notifUnread}
            onLogout={handleLogout}
          />
        </div>

        <div className="acct-main">
          {section !== "overview" && (
            <a className="btn btn-ghost btn-sm acct-back" href="#/profile">
              ← Account
            </a>
          )}

          {section === "overview" && <AccountOverview favoriteCount={favoriteCount} />}

          {section === "listings" && <AccountListings />}

          {section === "offers" && (
            <section aria-labelledby="acct-offers-heading">
              <h2 id="acct-offers-heading" className="visually-hidden">Offers</h2>
              <div className="sale-filter" role="tablist" aria-label="Offer direction">
                {[
                  ["received", "Received"],
                  ["sent", "Sent"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={tab === value}
                    className={tab === value ? "chip is-active" : "chip"}
                    onClick={() => setTab(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div role="tabpanel" aria-label={tab === "received" ? "Offers received" : "Offers sent"}>
                {tab === "received" ? <SellerOffersPage /> : <BuyerOffersPage />}
              </div>
            </section>
          )}

          {section === "orders" && (
            orderId
              ? <OrderDetailPage id={orderId} />
              : <OrdersPage />
          )}

          {section === "favorites" && (
            <FavoritesPage favorites={favorites} onToggleFavorite={onToggleFavorite} />
          )}

          {section === "messages" && <MessagesPage />}

          {section === "notifications" && <NotificationsPage />}

          {section === "reviews" && (
            <section aria-labelledby="acct-reviews-heading">
              <h2 id="acct-reviews-heading">Reviews about you</h2>
              <ReviewsSection authFetch={authFetch} isAuthenticated={isAuthenticated} userId={user?.id} />
            </section>
          )}

          {section === "settings" && <AccountSettings />}

          {section === "support" && (
            ticketId
              ? <SupportDetailPage id={ticketId} backHref="#/profile/support" backLabel="Support" />
              : <SupportPage detailBase="/profile/support" />
          )}
        </div>
      </div>
    </div>
  );
}
