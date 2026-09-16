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
import Button from "../ui/Button.jsx";
import Pill from "../ui/Pill.jsx";
import Tabs from "../ui/Tabs.jsx";

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
    return <p className="ce-small ce-muted">Redirecting to login…</p>;
  }

  const displayName = user?.profile?.display_name ?? user?.email?.split("@")[0] ?? "Account";

  return (
    <div className="ce-scope">
      <div className="ce-container ce-stack">
        <div className="ce-acct-head">
          <span className="ce-acct-avatar" aria-hidden="true">
            {displayName.charAt(0).toUpperCase()}
          </span>
          <div>
            <p className="ce-micro ce-muted">Account</p>
            <h1 className="ce-h1">{displayName}</h1>
            <p className="ce-small ce-muted">{user?.email}</p>
          </div>
          <div className="ce-acct-status">
            <Pill status={user?.status} />
            <Button variant="ghost" size="sm" href="#/profile/settings">
              Edit profile
            </Button>
          </div>
        </div>

        <div className="ce-acct-layout">
          <div className="ce-acct-rail">
            <AccountNav
              section={section}
              favoriteCount={favoriteCount}
              notifUnread={notifUnread}
              onLogout={handleLogout}
            />
          </div>

          <div className="ce-acct-main">
            {section !== "overview" && (
              <div>
                <Button variant="ghost" size="sm" href="#/profile">
                  ← Account
                </Button>
              </div>
            )}

            {section === "overview" && <AccountOverview favoriteCount={favoriteCount} />}

          {section === "listings" && <AccountListings />}

            {section === "offers" && (
              <section aria-labelledby="acct-offers-heading">
                <h2 id="acct-offers-heading" className="ce-visually-hidden">Offers</h2>
                <Tabs
                  label="Offer direction"
                  value={tab}
                  onChange={setTab}
                  tabs={[
                    { id: "received", label: "Received" },
                    { id: "sent", label: "Sent" },
                  ]}
                />
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
              <section aria-labelledby="acct-reviews-heading" className="ce-stack">
                <h2 id="acct-reviews-heading" className="ce-h2">Reviews about you</h2>
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
    </div>
  );
}
