import { useCallback, useEffect, useMemo, useState } from "react";

import { ApiError } from "../api/client.js";
import { myOrders } from "../api/checkout.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { formatPrice } from "../data/listings.js";
import Button from "../components/ui/Button.jsx";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/States.jsx";

const TABS = [
  { value: "", label: "All", status: null },
  { value: "PENDING_PAYMENT", label: "Pending", status: "PENDING_PAYMENT" },
  { value: "DELIVERED", label: "Completed", status: "DELIVERED" },
  { value: "CANCELLED", label: "Cancelled", status: "CANCELLED" },
];
const PAGE_SIZE = 10;
const FETCH_LIMIT = 100;

function shortId(id) {
  return String(id ?? "").split("-")[0].toUpperCase() || "—";
}

function formatDate(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "—";
  return date
    .toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })
    .toUpperCase();
}

/**
 * Buyer purchase history for the authenticated user. All data comes
 * from GET /orders/me (strictly buyer-scoped server-side). Status
 * tabs and stats use real single-status server filters; search/sort
 * run client-side over the loaded set. Order rows carry no image or
 * quantity fields in the API, so thumbnails use the existing monogram
 * fallback and no quantity is shown. Detail opens the existing
 * OrderDetailPage route (#/orders/:id).
 */
export default function MyPurchasesPage() {
  const { authFetch } = useAuth();
  const [tab, setTab] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(0);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({ total: null, completed: null, pending: null, cancelled: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadStats = useCallback(async () => {
    const [all, completed, pending, cancelled] = await Promise.all([
      myOrders(authFetch, { limit: 1 }).catch(() => null),
      myOrders(authFetch, { status: "DELIVERED", limit: 1 }).catch(() => null),
      myOrders(authFetch, { status: "PENDING_PAYMENT", limit: 1 }).catch(() => null),
      myOrders(authFetch, { status: "CANCELLED", limit: 1 }).catch(() => null),
    ]);
    setStats({
      total: all?.total ?? null,
      completed: completed?.total ?? null,
      pending: pending?.total ?? null,
      cancelled: cancelled?.total ?? null,
    });
  }, [authFetch]);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await myOrders(authFetch, {
        status: tab || undefined,
        limit: FETCH_LIMIT,
        offset: 0,
      });
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
      setPage(0);
    } catch (err) {
      setError(err instanceof ApiError ? `Could not load orders (${err.status}).` : "Network error.");
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [authFetch, tab]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = q
      ? items.filter((order) => (order.listing_title_snapshot ?? "").toLowerCase().includes(q))
      : [...items];
    rows.sort((a, b) =>
      sort === "oldest"
        ? new Date(a.created_at) - new Date(b.created_at)
        : new Date(b.created_at) - new Date(a.created_at),
    );
    return rows;
  }, [items, query, sort]);

  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(page, pages - 1);
  const pageItems = visible.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const statItems = [
    { label: "Total Orders", value: stats.total },
    { label: "Completed", value: stats.completed },
    { label: "Pending", value: stats.pending },
    { label: "Cancelled", value: stats.cancelled },
  ];

  return (
    <div className="ce-stack">
      <dl className="myacct-stats myacct-stats--row">
        {statItems.map((item) => (
          <div key={item.label} className="myacct-stat-card">
            <dd>{item.value ?? (loading ? "…" : "—")}</dd>
            <dt>{item.label}</dt>
          </div>
        ))}
      </dl>

      <div className="myacct-toolbar">
        <div className="myacct-tabs" role="group" aria-label="Filter by status">
          {TABS.map((item) => (
            <button
              key={item.label}
              type="button"
              className={tab === item.value ? "myacct-tab is-active" : "myacct-tab"}
              aria-pressed={tab === item.value}
              onClick={() => setTab(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="myacct-toolbar-row">
          <input
            type="search"
            className="ce-input myacct-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search orders..."
            aria-label="Search orders"
          />
          <label className="myacct-sort">
            <span>Sort by:</span>
            <select value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
            </select>
          </label>
        </div>
      </div>

      {loading && <LoadingState label="Loading your purchases…" />}
      {error && <ErrorState message={error} onRetry={loadItems} />}
      {!loading && !error && visible.length === 0 && (
        <EmptyState
          title="No purchases yet"
          hint="Your purchased items will appear here."
          action={
            <Button variant="primary" size="sm" href="#/buy">
              Shop the Marketplace
            </Button>
          }
        />
      )}
      {!loading && !error && visible.length > 0 && (
        <>
          <ul className="myacct-orders">
            {pageItems.map((order) => (
              <li key={order.id} className="myacct-order-card">
                <div className="myacct-order-head">
                  <span className="myacct-order-id">Order #{shortId(order.id)}</span>
                  <span className="myacct-order-date">{formatDate(order.created_at)}</span>
                </div>
                <div className="myacct-order-body">
                  <span className="myacct-thumb myacct-thumb--lg" aria-hidden="true">
                    <span className="myacct-thumb-mono">
                      {(order.listing_title_snapshot ?? "?").trim().charAt(0).toUpperCase() || "?"}
                    </span>
                  </span>
                  <div className="myacct-listing-main">
                    <p className="myacct-listing-title">{order.listing_title_snapshot}</p>
                    <p className="ce-small ce-muted">{order.listing?.sale_type === "AUCTION" ? "Auction" : "Fixed price"}</p>
                  </div>
                  <p className="myacct-listing-price">{formatPrice(order.total_minor)}</p>
                  <span className="myacct-status">{order.status}</span>
                  <a className="myacct-view-order" href={`#/orders/${order.id}`}>
                    View Order →
                  </a>
                </div>
              </li>
            ))}
          </ul>
          {total > FETCH_LIMIT && (
            <p className="ce-small ce-muted">Showing the first {FETCH_LIMIT} of {total}.</p>
          )}
          {pages > 1 && (
            <div className="myacct-pager">
              <Button
                variant="ghost"
                size="sm"
                disabled={safePage === 0}
                onClick={() => setPage(safePage - 1)}
              >
                ← Prev
              </Button>
              <span className="ce-small ce-muted">
                Page {safePage + 1} of {pages}
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={safePage >= pages - 1}
                onClick={() => setPage(safePage + 1)}
              >
                Next →
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
