import { useEffect, useState } from "react";

import { ApiError } from "../api/client.js";
import { clearToken, fetchMe, getToken, login } from "../auth/auth.js";
import { ErrorState, Loading } from "./components/ui.jsx";
import { AuctionDetailPage, AuctionsPage } from "./pages/Auctions.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import { ListingDetailPage, ListingsPage } from "./pages/Listings.jsx";
import { ModerationDetailPage, ModerationPage } from "./pages/Moderation.jsx";
import { OrderDetailPage, OrdersPage } from "./pages/Orders.jsx";
import PaymentsPage from "./pages/Payments.jsx";
import { ReportDetailPage, ReportsPage } from "./pages/Reports.jsx";
import { ReviewsPage } from "./pages/Reviews.jsx";
import { SupportDetailPage as AdminSupportDetailPage, SupportPage as AdminSupportPage } from "./pages/Support.jsx";
import { UserDetailPage, UsersPage } from "./pages/Users.jsx";
import "./admin.css";

const NAV = [
  ["dashboard", "Dashboard", "#/admin"],
  ["users", "Users", "#/admin/users"],
  ["listings", "Listings", "#/admin/listings"],
  ["orders", "Orders", "#/admin/orders"],
  ["auctions", "Auctions", "#/admin/auctions"],
  ["payments", "Payments", "#/admin/payments"],
  ["reviews", "Reviews", "#/admin/reviews"],
  ["moderation", "Moderation", "#/admin/moderation"],
  ["reports", "Reports", "#/admin/reports"],
  ["support", "Support", "#/admin/support"],
];

const FUTURE = [];

function LoginForm({ onDone, initialError }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError ?? null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? `Login failed (${err.status}): ${err.message}` : "Login failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-login-wrap">
      <form className="admin-login" onSubmit={submit}>
        <h1>Admin sign in</h1>
        <p className="muted">Restricted area. ADMIN role required — enforced by the backend.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <label>
          <span>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
        </label>
        <label>
          <span>Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        </label>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <a className="back-link" href="#/">← Back to marketplace</a>
      </form>
    </div>
  );
}

export default function AdminApp({ route }) {
  const [auth, setAuth] = useState({ loading: true, user: null, error: null });
  const [menuOpen, setMenuOpen] = useState(false);

  async function checkAuth() {
    const token = getToken();
    if (!token) {
      setAuth({ loading: false, user: null, error: null });
      return;
    }
    setAuth({ loading: true, user: null, error: null });
    try {
      const me = await fetchMe();
      setAuth({ loading: false, user: me, error: null });
    } catch {
      clearToken();
      setAuth({ loading: false, user: null, error: "Session expired. Please sign in again." });
    }
  }

  useEffect(() => {
    checkAuth();
  }, []);
  useEffect(() => {
    setMenuOpen(false);
  }, [window.location.hash]); // eslint-disable-line react-hooks/exhaustive-deps

  if (auth.loading) {
    return (
      <div className="admin-shell">
        <Loading label="Checking admin session…" />
      </div>
    );
  }

  if (!auth.user) {
    return (
      <div className="admin-shell">
        <LoginForm onDone={checkAuth} initialError={auth.error} />
      </div>
    );
  }

  if (!auth.user.roles?.includes("ADMIN")) {
    return (
      <div className="admin-shell">
        <ErrorState message={`Access denied for ${auth.user.email}. ADMIN role required (backend-enforced).`} />
        <div className="admin-center">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => { clearToken(); checkAuth(); }}
          >
            Sign out
          </button>{" "}
          <a className="btn btn-primary" href="#/">Back to marketplace</a>
        </div>
      </div>
    );
  }

  const section = route.section ?? "dashboard";
  const activeId = route.id ?? null;

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <button
          type="button"
          className="menu-toggle"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          ☰
        </button>
        <a className="admin-brand" href="#/admin">Marketplace · Admin</a>
        <span className="admin-user">{auth.user.email}</span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => { clearToken(); checkAuth(); }}
        >
          Sign out
        </button>
      </header>

      <div className="admin-body">
        <nav className={menuOpen ? "admin-sidebar open" : "admin-sidebar"} aria-label="Admin">
          <p className="sidebar-heading">Manage</p>
          <ul>
            {NAV.map(([key, label, href]) => (
              <li key={key}>
                <a
                  href={href}
                  className={section === key || (key === "dashboard" && section === "dashboard") ? "active" : ""}
                  aria-current={section === key ? "page" : undefined}
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
          {FUTURE.length > 0 && (
          <>
            <p className="sidebar-heading">Coming soon</p>
            <ul>
              {FUTURE.map((label) => (
                <li key={label}><span className="sidebar-soon">{label}</span></li>
              ))}
            </ul>
          </>
        )}
        <p className="sidebar-foot"><a href="#/">← Marketplace</a></p>
        </nav>

        <main className="admin-content">
          {section === "dashboard" && <Dashboard />}
          {section === "users" && (activeId ? <UserDetailPage id={activeId} /> : <UsersPage />)}
          {section === "listings" && (activeId ? <ListingDetailPage id={activeId} /> : <ListingsPage />)}
          {section === "orders" && (activeId ? <OrderDetailPage id={activeId} /> : <OrdersPage />)}
          {section === "auctions" && (activeId ? <AuctionDetailPage id={activeId} /> : <AuctionsPage />)}
          {section === "payments" && <PaymentsPage />}
          {section === "reviews" && <ReviewsPage />}
          {section === "moderation" && (activeId ? <ModerationDetailPage id={activeId} /> : <ModerationPage />)}
          {section === "reports" && (activeId ? <ReportDetailPage id={activeId} /> : <ReportsPage />)}
          {section === "support" && (activeId ? <AdminSupportDetailPage id={activeId} /> : <AdminSupportPage />)}
          {!["dashboard", "users", "listings", "orders", "auctions", "payments", "reviews", "moderation", "reports", "support"].includes(section) && (
            <ErrorState message="Unknown admin section." />
          )}
        </main>
      </div>
    </div>
  );
}
