import { useCallback, useEffect, useMemo, useState } from "react";

import { ApiError } from "../api/client.js";
import { myOffers } from "../api/offers.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { formatPrice } from "../data/listings.js";
import Button from "../components/ui/Button.jsx";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/States.jsx";

const TABS = ["", "PENDING", "ACCEPTED", "REJECTED"];
const PAGE_SIZE = 10;
const FETCH_LIMIT = 100;

function tabLabel(status) {
  if (status === "") return "All";
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function formatDate(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Buyer offer/bid activity for the authenticated user. All data comes
 * from GET /offers/me (strictly buyer-scoped server-side). Status tabs
 * and stats use real single-status server filters; search/sort run
 * client-side over the loaded set. Rows show only OfferOut fields:
 * listing title, offer amount, status, submitted date. View opens the
 * existing listing-detail route (no duplicate bid-detail system).
 */
export default function MyBidsPage() {
  const { authFetch } = useAuth();
  const [tab, setTab] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(0);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({ total: null, pending: null, accepted: null, rejected: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadStats = useCallback(async () => {
    const [all, pending, accepted, rejected] = await Promise.all([
      myOffers(authFetch, { limit: 1 }).catch(() => null),
      myOffers(authFetch, { status: "PENDING", limit: 1 }).catch(() => null),
      myOffers(authFetch, { status: "ACCEPTED", limit: 1 }).catch(() => null),
      myOffers(authFetch, { status: "REJECTED", limit: 1 }).catch(() => null),
    ]);
    setStats({
      total: all?.total ?? null,
      pending: pending?.total ?? null,
      accepted: accepted?.total ?? null,
      rejected: rejected?.total ?? null,
    });
  }, [authFetch]);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await myOffers(authFetch, {
        status: tab || undefined,
        limit: FETCH_LIMIT,
        offset: 0,
      });
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
      setPage(0);
    } catch (err) {
      setError(err instanceof ApiError ? `Could not load bids (${err.status}).` : "Network error.");
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
      ? items.filter((offer) => (offer.listing?.title ?? "").toLowerCase().includes(q))
      : [...items];
    switch (sort) {
      case "oldest":
        rows.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        break;
      case "amount-desc":
        rows.sort((a, b) => (b.amount_minor ?? 0) - (a.amount_minor ?? 0));
        break;
      case "amount-asc":
        rows.sort((a, b) => (a.amount_minor ?? 0) - (b.amount_minor ?? 0));
        break;
      default:
        rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
    return rows;
  }, [items, query, sort]);

  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(page, pages - 1);
  const pageItems = visible.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const statItems = [
    { label: "Total Bids", value: stats.total },
    { label: "Pending", value: stats.pending },
    { label: "Accepted", value: stats.accepted },
    { label: "Rejected", value: stats.rejected },
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
          {TABS.map((value) => (
            <button
              key={value || "all"}
              type="button"
              className={tab === value ? "myacct-tab is-active" : "myacct-tab"}
              aria-pressed={tab === value}
              onClick={() => setTab(value)}
            >
              {tabLabel(value)}
            </button>
          ))}
        </div>
        <div className="myacct-toolbar-row">
          <input
            type="search"
            className="ce-input myacct-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search..."
            aria-label="Search your bids"
          />
          <label className="myacct-sort">
            <span>Sort by:</span>
            <select value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="amount-desc">Amount: High to Low</option>
              <option value="amount-asc">Amount: Low to High</option>
            </select>
          </label>
        </div>
      </div>

      {loading && <LoadingState label="Loading your bids…" />}
      {error && <ErrorState message={error} onRetry={loadItems} />}
      {!loading && !error && visible.length === 0 && (
        <EmptyState
          title="My bids is empty"
          hint="Your offers and auction activity will appear here."
          action={
            <Button variant="primary" size="sm" href="#/buy">
              Explore Auctions
            </Button>
          }
        />
      )}
      {!loading && !error && visible.length > 0 && (
        <>
          <ul className="myacct-listings">
            {pageItems.map((offer) => (
              <li key={offer.id} className="myacct-listing-row">
                <span className="myacct-thumb myacct-thumb--lg" aria-hidden="true">
                  <span className="myacct-thumb-mono">
                    {(offer.listing?.title ?? "?").trim().charAt(0).toUpperCase() || "?"}
                  </span>
                </span>
                <div className="myacct-listing-main">
                  <p className="myacct-listing-title">{offer.listing?.title ?? "—"}</p>
                  <p className="ce-small ce-muted">
                    Your offer · Submitted {formatDate(offer.created_at)}
                  </p>
                </div>
                <p className="myacct-listing-price">{formatPrice(offer.amount_minor)}</p>
                <span className="myacct-status">{offer.status}</span>
                <div className="myacct-listing-actions">
                  <Button variant="ghost" size="sm" href={`#/listing/${offer.listing_id}`}>
                    View →
                  </Button>
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
