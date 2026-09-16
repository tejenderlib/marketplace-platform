import { useEffect, useMemo, useState } from "react";

import Footer from "./components/marketplace/SiteFooter.jsx";
import SiteHeader from "./components/marketplace/SiteHeader.jsx";
import HomePage from "./components/marketplace/HomePage.jsx";
import LandingPage from "./components/landing/LandingPage.jsx";
import ListingDetailView from "./components/marketplace/ListingDetailView.jsx";
import DiscoveryGrid from "./components/marketplace/DiscoveryGrid.jsx";
import NotFound from "./components/NotFound.jsx";
import AdminApp from "./admin/AdminApp.jsx";
import { normalizeListing } from "./api/catalog.js";
import { useAuth } from "./auth/AuthContext.jsx";
import { useCategories, useListingDetail, useListings } from "./hooks/useCatalog.js";
import { useFavorites } from "./hooks/useFavorites.js";
import LoginPage from "./pages/Login.jsx";
import RegisterPage from "./pages/Register.jsx";
import SellPage from "./pages/Sell.jsx";
import UiPreview from "./components/UiPreview.jsx";
import AccountWorkspace from "./components/account/AccountWorkspace.jsx";
import SellerProfilePage from "./pages/SellerProfile.jsx";
import CheckoutPage from "./pages/Checkout.jsx";
import PaymentPage from "./pages/Payment.jsx";
import AuctionCheckoutPage from "./pages/AuctionCheckout.jsx";
import OfferCheckoutPage from "./pages/OfferCheckout.jsx";
import SupportPage from "./pages/Support.jsx";
import SupportDetailPage from "./pages/SupportDetail.jsx";
import ReportsPage from "./pages/Reports.jsx";

const PAGE_SIZE = 12;

function parseRoute() {
  // Private Step-1 sign-off artifact; excluded from site navigation.
  if (window.location.hash.startsWith("#/ui-preview")) return { page: "ui-preview" };  const adminMatch = window.location.hash.match(/^#\/admin(?:\/(\w+)(?:\/([\w-]+))?)?\/?$/);
  if (adminMatch) {
    return {
      page: "admin",
      section: adminMatch[1] ?? "dashboard",
      id: adminMatch[2] ?? null,
    };
  }
  if (window.location.hash.startsWith("#/login")) return { page: "login" };
  if (window.location.hash.startsWith("#/register")) return { page: "register" };
  if (window.location.hash.startsWith("#/favorites")) {
    return { page: "profile", section: "favorites" };
  }
  const profileSupportMatch = window.location.hash.match(/^#\/profile\/support\/([\w-]+)/);
  if (profileSupportMatch) {
    return { page: "profile", section: "support", ticketId: profileSupportMatch[1] };
  }
  const profileMatch = window.location.hash.match(/^#\/profile(?:\/(\w+))?/);
  if (profileMatch) {
    const valid = ["overview", "listings", "offers", "orders", "favorites", "messages", "notifications", "reviews", "support", "settings"];
    return { page: "profile", section: valid.includes(profileMatch[1]) ? profileMatch[1] : "overview" };
  }
  if (window.location.hash.startsWith("#/notifications")) {
    return { page: "profile", section: "notifications" };
  }
  if (window.location.hash.startsWith("#/messages")) {
    return { page: "profile", section: "messages" };
  }
  if (window.location.hash.startsWith("#/reports")) return { page: "reports" };
  const supportMatch = window.location.hash.match(/^#\/support\/([\w-]+)/);
  if (supportMatch) return { page: "support-detail", id: supportMatch[1] };
  if (window.location.hash.startsWith("#/support")) return { page: "support" };
  if (window.location.hash.startsWith("#/seller/offers")) {
    return { page: "profile", section: "offers", offersTab: "received" };
  }
  if (window.location.hash === "#/sell" || window.location.hash.startsWith("#/sell?")) {
    return { page: "sell" };
  }
  const sellerProfile = window.location.hash.match(/^#\/seller\/([\w-]+)/);
  if (sellerProfile) return { page: "seller", id: sellerProfile[1] };
  if (window.location.hash.startsWith("#/offers")) {
    return { page: "profile", section: "offers", offersTab: "sent" };
  }
  // Phase 1 landing owns "#/". The existing discovery experience is
  // preserved under "#/buy" so Phase 3 can bind it without rework.
  if (window.location.hash.startsWith("#/buy")) {
    return { page: "buy" };
  }
  const checkoutFixed = window.location.hash.match(/^#\/checkout\/fixed\/([\w-]+)/);
  if (checkoutFixed) return { page: "checkout", id: checkoutFixed[1] };
  const checkoutAuction = window.location.hash.match(/^#\/checkout\/auction\/([\w-]+)/);
  if (checkoutAuction) return { page: "auction-checkout", id: checkoutAuction[1] };
  const checkoutOffer = window.location.hash.match(/^#\/checkout\/offer\/([\w-]+)/);
  if (checkoutOffer) return { page: "offer-checkout", id: checkoutOffer[1] };
  const checkoutPay = window.location.hash.match(/^#\/checkout\/payment\/([\w-]+)/);
  if (checkoutPay) return { page: "payment", id: checkoutPay[1] };
  const orderMatch = window.location.hash.match(/^#\/orders\/([\w-]+)/);
  if (orderMatch) return { page: "profile", section: "orders", orderId: orderMatch[1] };
  if (window.location.hash.startsWith("#/orders")) {
    return { page: "profile", section: "orders" };
  }
  const match = window.location.hash.match(/^#\/listing\/([\w-]+)/);
  if (match) return { page: "detail", id: match[1] };
  return { page: "home" };
}

export default function App() {
  const { user, isAuthenticated, authFetch, logout, redirectToLogin } = useAuth();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [saleType, setSaleType] = useState("");
  const [offset, setOffset] = useState(0);
  const [notice, setNotice] = useState(null);
  const [route, setRoute] = useState(parseRoute);

  useEffect(() => {
    function onHashChange() {
      setRoute(parseRoute());
      setNotice(null);
      window.scrollTo(0, 0);
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => clearTimeout(timer);
  }, [query]);

  const categoriesState = useCategories();
  const listingsState = useListings(
    route.page === "home" ||
      route.page === "buy" ||
      route.page === "detail"
      ? {
          q: route.page === "buy" ? debouncedQuery : "",
          category_id: route.page === "buy" && activeCategory !== "All" ? activeCategory : "",
          sale_type: route.page === "buy" ? saleType : "",
          limit: PAGE_SIZE,
          offset: route.page === "buy" ? offset : 0,
        }
      : null,
  );
  const items = useMemo(
    () => listingsState.items.map(normalizeListing),
    [listingsState.items],
  );
  const pages = Math.max(1, Math.ceil(listingsState.total / PAGE_SIZE));
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const activeCategoryName =
    activeCategory === "All"
      ? "All"
      : (categoriesState.data.find((c) => c.id === activeCategory)?.name ?? "");

  // NOTE: every hook below runs on every render, before any early return.
  const { ids: favorites, toggleFavorite: toggleFavoriteApi } = useFavorites({
    isAuthenticated,
    authFetch,
    onAuthRequired: redirectToLogin,
  });

  async function toggleFavorite(id) {
    const result = await toggleFavoriteApi(id);
    if (!result.ok && !result.redirected) {
      setNotice(result.message ?? "Could not update favorites.");
    }
  }

  function placeholderAction(label) {
    setNotice(`${label} is coming soon — API integration arrives in a later milestone.`);
  }

  function clearFilters() {
    setQuery("");
    setDebouncedQuery("");
    setActiveCategory("All");
    setSaleType("");
    setOffset(0);
  }

  function selectCategory(id) {
    setActiveCategory(id);
    setOffset(0);
  }

  function clearSearch() {
    setQuery("");
    setDebouncedQuery("");
    setOffset(0);
  }

  function selectSaleType(value) {
    setSaleType(value);
    setOffset(0);
  }

  function goHome() {
    if (window.location.hash !== "#/") {
      window.location.hash = "#/";
    }
    setOffset(0);
    window.scrollTo(0, 0);
  }

  function goBuy() {
    if (window.location.hash !== "#/buy") {
      window.location.hash = "#/buy";
    }
    setOffset(0);
    window.scrollTo(0, 0);
  }

  function showAuctions() {
    setActiveCategory("All");
    setSaleType("AUCTION");
    goBuy();
  }

  function buyEquipment() {
    setActiveCategory("All");
    setSaleType("FIXED_PRICE");
    goBuy();
  }

  // NOTE: every hook must run on every render, before any early return
  // below. The detail/similar hooks idle (null params) on other routes.
  const detailState = useListingDetail(route.page === "detail" ? route.id : null);
  const detail = detailState.data ? normalizeListing(detailState.data) : null;
  const similarState = useListings(
    detail
      ? { category_id: detail.categoryId, limit: 5, offset: 0 }
      : null,
  );
  const similar = useMemo(
    () =>
      similarState.items
        .map(normalizeListing)
        .filter((item) => item.id !== route.id)
        .slice(0, 4),
    [similarState.items, route.id],
  );

  if (route.page === "ui-preview") {
    return (
      <div className="app">
        <UiPreview />
      </div>
    );
  }

  if (route.page === "admin") {
    return (
      <div className="app">
        <AdminApp route={route} />
      </div>
    );
  }

  if (route.page === "login") {
    return (
      <div className="app">
        <LoginPage />
      </div>
    );
  }

  if (route.page === "register") {
    return (
      <div className="app">
        <RegisterPage />
      </div>
    );
  }

  if (route.page === "profile") {
    return (
      <div className="app">
        <AccountWorkspace
          section={route.section ?? "overview"}
          offersTab={route.offersTab ?? "sent"}
          orderId={route.orderId ?? null}
          ticketId={route.ticketId ?? null}
          favorites={favorites}
          onToggleFavorite={toggleFavorite}
          favoriteCount={favorites.size}
        />
      </div>
    );
  }

  if (route.page === "seller") {
    return (
      <div className="app">
        <SellerProfilePage
          userId={route.id}
          favorites={favorites}
          onToggleFavorite={toggleFavorite}
        />
      </div>
    );
  }

  if (route.page === "sell") {
    return (
      <div className="app">
        <SellPage
          authFetch={authFetch}
          categories={categoriesState.data}
          isAuthenticated={isAuthenticated}
          onRequireLogin={redirectToLogin}
        />
      </div>
    );
  }

  if (route.page === "checkout") {
    return (
      <div className="app">
        <CheckoutPage listingId={route.id} />
      </div>
    );
  }

  if (route.page === "auction-checkout") {
    return (
      <div className="app">
        <AuctionCheckoutPage resultId={route.id} />
      </div>
    );
  }

  if (route.page === "offer-checkout") {
    return (
      <div className="app">
        <OfferCheckoutPage offerId={route.id} />
      </div>
    );
  }

  if (route.page === "payment") {
    return (
      <div className="app">
        <PaymentPage orderId={route.id} />
      </div>
    );
  }

  if (route.page === "reports") {
    return (
      <div className="app">
        <ReportsPage />
      </div>
    );
  }

  if (route.page === "support") {
    return (
      <div className="app">
        <SupportPage />
      </div>
    );
  }

  if (route.page === "support-detail") {
    return (
      <div className="app">
        <SupportDetailPage id={route.id} />
      </div>
    );
  }

  // Phase 1: "#/" is the monochrome BUY/SELL landing foundation.
  // Existing discovery + detail stay reachable under "#/buy" / listing
  // routes so later phases bind without rework.
  if (route.page === "home") {
    return (
      <div className="app">
        <LandingPage />
      </div>
    );
  }

  return (
    <div className="app ce-scope">
      <SiteHeader
        user={user}
        onLogin={() => {
          window.location.hash = "#/login";
        }}
        onOrders={() => {
          window.location.hash = "#/orders";
        }}
        onSell={() => {
          if (isAuthenticated) {
            window.location.hash = "#/sell";
          } else {
            redirectToLogin();
          }
        }}
        onAuctions={showAuctions}
        onBuy={buyEquipment}
        onLogout={async () => {
          await logout();
          setNotice("Signed out.");
        }}
        favoriteCount={favorites.size}
        categories={categoriesState.data}
        activeCategory={activeCategory}
        onSelectCategory={selectCategory}
        categoriesLoading={categoriesState.loading}
        categoriesError={categoriesState.error}
        onCategoriesRetry={categoriesState.reload}
        onViewAllAuctions={showAuctions}
        query={query}
        onQueryChange={setQuery}
      />

      {notice && (
        <div className="notice" role="status">
          <span>{notice}</span>
          <button
            type="button"
            className="notice-close"
            onClick={() => setNotice(null)}
            aria-label="Dismiss notice"
          >
            ✕
          </button>
        </div>
      )}

      <main>
        {route.page === "detail" ? (
          detailState.loading ? (
            <div className="content">
              <p className="muted" role="status">Loading listing…</p>
            </div>
          ) : detailState.error ? (
            <div className="content">
              <div className="empty-state" role="alert">
                <p>
                  {detailState.error.kind === "not-found"
                    ? "This listing does not exist."
                    : "Could not load this listing. Please retry."}
                </p>
                <a className="btn btn-primary" href="#/buy">
                  Back to listings
                </a>
              </div>
            </div>
          ) : detail ? (
            <ListingDetailView
              key={detail.id}
              listing={detail}
              isFavorite={favorites.has(detail.id)}
              onToggleFavorite={toggleFavorite}
              onPlaceholder={placeholderAction}
              isAuthenticated={isAuthenticated}
              currentUserId={user?.id ?? null}
              authFetch={authFetch}
              onRequireLogin={redirectToLogin}
              similar={similar}
              similarFavorites={favorites}
            />
          ) : (
            <NotFound />
          )
        ) : (
          <div className="ce-container">
            <HomePage
              items={items}
              total={listingsState.total}
              loading={listingsState.loading}
              error={listingsState.error}
              onRetry={listingsState.reload}
              favorites={favorites}
              onToggleFavorite={toggleFavorite}
              onClearFilters={clearFilters}
              onClearCategory={() => selectCategory("All")}
              onClearSearch={clearSearch}
              query={query}
              debouncedQuery={debouncedQuery}
              activeCategoryName={activeCategoryName}
              saleType={saleType}
              onSelectSaleType={selectSaleType}
              page={page}
              pages={pages}
              onPage={(next) => {
                setOffset((next - 1) * PAGE_SIZE);
                document.getElementById("listings")?.scrollIntoView();
              }}
              categories={categoriesState.data}
              activeCategory={activeCategory}
              onSelectCategory={selectCategory}
              categoriesLoading={categoriesState.loading}
              categoriesError={categoriesState.error}
              onCategoriesRetry={categoriesState.reload}
              onViewAllAuctions={showAuctions}
              onQueryChange={setQuery}
            />
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
