import { useEffect, useMemo, useState } from "react";

import CategoryGrid from "./components/CategoryGrid.jsx";
import Footer from "./components/Footer.jsx";
import Header from "./components/Header.jsx";
import Hero from "./components/Hero.jsx";
import ListingDetail from "./components/ListingDetail.jsx";
import ListingGrid from "./components/ListingGrid.jsx";
import NotFound from "./components/NotFound.jsx";
import AdminApp from "./admin/AdminApp.jsx";
import { normalizeListing } from "./api/catalog.js";
import { useAuth } from "./auth/AuthContext.jsx";
import { useCategories, useListingDetail, useListings } from "./hooks/useCatalog.js";
import { useFavorites } from "./hooks/useFavorites.js";
import LoginPage from "./pages/Login.jsx";
import RegisterPage from "./pages/Register.jsx";
import FavoritesPage from "./pages/Favorites.jsx";
import BuyerOffersPage from "./pages/BuyerOffers.jsx";
import SellerOffersPage from "./pages/SellerOffers.jsx";

const PAGE_SIZE = 12;

function parseRoute() {
  const adminMatch = window.location.hash.match(/^#\/admin(?:\/(\w+)(?:\/([\w-]+))?)?\/?$/);
  if (adminMatch) {
    return {
      page: "admin",
      section: adminMatch[1] ?? "dashboard",
      id: adminMatch[2] ?? null,
    };
  }
  if (window.location.hash.startsWith("#/login")) return { page: "login" };
  if (window.location.hash.startsWith("#/register")) return { page: "register" };
  if (window.location.hash.startsWith("#/favorites")) return { page: "favorites" };
  if (window.location.hash.startsWith("#/seller/offers")) return { page: "seller-offers" };
  if (window.location.hash.startsWith("#/offers")) return { page: "offers" };
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
    route.page === "home" || route.page === "detail"
      ? {
          q: route.page === "home" ? debouncedQuery : "",
          category_id: route.page === "home" && activeCategory !== "All" ? activeCategory : "",
          sale_type: route.page === "home" ? saleType : "",
          limit: PAGE_SIZE,
          offset: route.page === "home" ? offset : 0,
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

  function selectSaleType(value) {
    setSaleType(value);
    setOffset(0);
  }

  function handleQueryChange(value) {
    setQuery(value);
    if (route.page !== "home" && window.location.hash !== "#/") {
      window.location.hash = "#/";
    }
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

  if (route.page === "favorites") {
    return (
      <div className="app">
        <FavoritesPage favorites={favorites} onToggleFavorite={toggleFavorite} />
      </div>
    );
  }

  if (route.page === "offers") {
    return (
      <div className="app">
        <BuyerOffersPage />
      </div>
    );
  }

  if (route.page === "seller-offers") {
    return (
      <div className="app">
        <SellerOffersPage />
      </div>
    );
  }

  return (
    <div className="app">
      <Header
        query={query}
        onQueryChange={handleQueryChange}
        user={user}
        onLogin={() => {
          window.location.hash = "#/login";
        }}
        onOrders={() => placeholderAction("My Orders")}
        onSell={() => {
          if (isAuthenticated) {
            placeholderAction("Selling");
          } else {
            redirectToLogin();
          }
        }}
        onLogout={async () => {
          await logout();
          setNotice("Signed out.");
        }}
        favoriteCount={favorites.size}
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
                <a className="btn btn-primary" href="#/">
                  Back to listings
                </a>
              </div>
            </div>
          ) : detail ? (
            <ListingDetail
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
          <>
            <Hero query={query} onQueryChange={setQuery} />
            <div className="content">
              {categoriesState.error ? (
                <div className="empty-state" role="alert">
                  <p>Could not load categories. {categoriesState.error.message ?? ""}</p>
                  <button type="button" className="btn btn-primary" onClick={categoriesState.reload}>
                    Retry
                  </button>
                </div>
              ) : (
                <CategoryGrid
                  categories={categoriesState.data}
                  active={activeCategory}
                  onSelect={selectCategory}
                  loading={categoriesState.loading}
                />
              )}
              <div className="sale-filter" role="group" aria-label="Sale type filter">
                {[
                  ["", "All types"],
                  ["FIXED_PRICE", "Fixed price"],
                  ["AUCTION", "Auction"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={saleType === value ? "chip is-active" : "chip"}
                    aria-pressed={saleType === value}
                    onClick={() => selectSaleType(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <ListingGrid
                items={items}
                total={listingsState.total}
                loading={listingsState.loading}
                error={listingsState.error}
                onRetry={listingsState.reload}
                favorites={favorites}
                onToggleFavorite={toggleFavorite}
                onClearFilters={clearFilters}
                query={debouncedQuery}
                activeCategoryName={activeCategoryName}
                page={page}
                pages={pages}
                onPage={(next) => {
                  setOffset((next - 1) * PAGE_SIZE);
                  document.getElementById("listings")?.scrollIntoView();
                }}
              />
            </div>
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}
