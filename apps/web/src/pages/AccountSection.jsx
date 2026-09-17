import { useState } from "react";

import { useAuth } from "../auth/AuthContext.jsx";
import MyAccountSidebar from "../components/account/MyAccountSidebar.jsx";
import MySettingsPage from "./AccountSettingsPage.jsx";
import MyBidsPage from "./MyBids.jsx";
import MyListingsPage from "./MyListings.jsx";
import MyPurchasesPage from "./MyPurchases.jsx";
import MySavedItemsPage from "./MySavedItems.jsx";
import Button from "../components/ui/Button.jsx";

const SECTIONS = {
  listings: {
    nav: "My Listings",
    title: "My Listings",
    subtitle: "Track every listing you have put up for sale.",
  },
  purchases: {
    nav: "My Purchases",
    title: "My Purchases",
    subtitle: "View your orders and track your purchase history.",
  },
  bids: {
    nav: "My Bids",
    title: "My Bids",
    subtitle: "Track your offers and auction activity.",
  },
  saved: {
    nav: "Saved Items",
    title: "Saved Items",
    subtitle: "Keep track of items you want to come back to.",
  },
  settings: {
    nav: "Account Settings",
    title: "Account Settings",
    subtitle: "Manage your profile and preferences.",
  },
};

/**
 * Account section shell: the shared new-account layout (sidebar +
 * content) around the EXISTING section components, rendered verbatim.
 * Unknown sections fall back to the listings view; legacy #/profile/*
 * routes keep working untouched.
 */
export default function AccountSection({ section, favorites, onToggleFavorite }) {
  const { logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const meta = SECTIONS[section] ?? SECTIONS.listings;
  const active = SECTIONS[section] ? meta.nav : "My Listings";

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

  return (
    <div className="ce-scope myacct">
      <div className="myacct-body">
        <div className="myacct-head myacct-head--row">
          <div>
            <h1>{meta.title}</h1>
            <p>{meta.subtitle}</p>
          </div>
          {(!section || section === "listings") && (
            <Button variant="primary" size="sm" href="#/sell">
              + Create a Listing
            </Button>
          )}
          {section === "purchases" && (
            <Button variant="ghost" size="sm" href="#/buy">
              View Marketplace
            </Button>
          )}
        </div>

        <div className="myacct-layout">
          <MyAccountSidebar active={active} onLogout={handleLogout} logoutDisabled={loggingOut} />

          <div className="myacct-main">
            {section === "purchases" && <MyPurchasesPage />}
            {section === "bids" && <MyBidsPage />}
            {section === "saved" && (
              <MySavedItemsPage favorites={favorites} onToggleFavorite={onToggleFavorite} />
            )}
            {section === "settings" && <MySettingsPage />}
            {(!section || section === "listings" || !SECTIONS[section]) && <MyListingsPage />}
          </div>
        </div>
      </div>
    </div>
  );
}
