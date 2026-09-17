import { useCallback, useEffect, useMemo, useState } from "react";

import { ApiError } from "../api/client.js";
import { myListings, submitListing, updateListing } from "../api/seller.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { formatPrice } from "../data/listings.js";
import { useAuthedImageUrl } from "../components/sell/PhotoThumb.jsx";
import Button from "../components/ui/Button.jsx";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/States.jsx";

const TABS = ["", "ACTIVE", "SOLD", "DRAFT", "EXPIRED"];
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

function priceLabel(item) {
  if (item.sale_type === "AUCTION") return "Auction";
  if (item.fixed_price_minor != null) return formatPrice(item.fixed_price_minor);
  return "—";
}

function RowThumb({ item }) {
  const imageId = item.images?.[0]?.id ?? null;
  const { url, broken } = useAuthedImageUrl(imageId ? item.id : null, imageId);
  if (imageId && url && !broken) {
    return <img src={url} alt="" className="myacct-thumb-img" aria-hidden="true" />;
  }
  return (
    <span className="myacct-thumb-mono" aria-hidden="true">
      {(item.title ?? "?").trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

/**
 * Seller listing management for the authenticated user. All data comes
 * from GET /catalog/listings/mine (strictly owner-scoped server-side).
 * Status tabs are server-filtered; search/sort/pagination run
 * client-side over the loaded set (the endpoint offers no search
 * parameter). Row actions reuse live endpoints only: Publish
 * (POST /submit, DRAFT only), Archive (PATCH status, DRAFT/ACTIVE
 * only) and View. No edit UI exists anymore (the Seller Hub flow was
 * retired), so no Edit action is offered.
 */
export default function MyListingsPage() {
  const { authFetch } = useAuth();
  const [tab, setTab] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(0);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({ total: null, active: null, sold: null, drafts: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const loadStats = useCallback(async () => {
    const [all, active, sold, drafts] = await Promise.all([
      myListings(authFetch, { limit: 1 }).catch(() => null),
      myListings(authFetch, { status: "ACTIVE", limit: 1 }).catch(() => null),
      myListings(authFetch, { status: "SOLD", limit: 1 }).catch(() => null),
      myListings(authFetch, { status: "DRAFT", limit: 1 }).catch(() => null),
    ]);
    setStats({
      total: all?.total ?? null,
      active: active?.total ?? null,
      sold: sold?.total ?? null,
      drafts: drafts?.total ?? null,
    });
  }, [authFetch]);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await myListings(authFetch, {
        status: tab || undefined,
        limit: FETCH_LIMIT,
        offset: 0,
      });
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
      setPage(0);
    } catch (err) {
      setError(err instanceof ApiError ? `Could not load listings (${err.status}).` : "Network error.");
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
    let rows = q
      ? items.filter(
          (item) =>
            (item.title ?? "").toLowerCase().includes(q) ||
            (item.category?.name ?? "").toLowerCase().includes(q),
        )
      : [...items];
    const priceOf = (item) => item.fixed_price_minor ?? Number.POSITIVE_INFINITY;
    switch (sort) {
      case "oldest":
        rows.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        break;
      case "price-desc":
        rows.sort((a, b) => priceOf(b) - priceOf(a));
        break;
      case "price-asc":
        rows.sort((a, b) => priceOf(a) - priceOf(b));
        break;
      default:
        rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
    return rows;
  }, [items, query, sort]);

  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(page, pages - 1);
  const pageItems = visible.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  async function refresh() {
    await loadItems();
    await loadStats();
  }

  async function handlePublish(item) {
    setBusyId(item.id);
    setNotice(null);
    try {
      await submitListing(authFetch, item.id);
      setNotice(`“${item.title}” is now live and visible to buyers.`);
      await refresh();
    } catch (err) {
      setNotice(null);
      setError(err instanceof ApiError ? `Could not publish (${err.status}).` : "Network error.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleArchive(item) {
    setBusyId(item.id);
    setNotice(null);
    try {
      await updateListing(authFetch, item.id, { status: "ARCHIVED" });
      setNotice(`“${item.title}” archived.`);
      await refresh();
    } catch (err) {
      setNotice(null);
      setError(err instanceof ApiError ? `Could not archive (${err.status}).` : "Network error.");
    } finally {
      setBusyId(null);
    }
  }

  const statItems = [
    { label: "Total Listings", value: stats.total },
    { label: "Active Listings", value: stats.active },
    { label: "Sold Items", value: stats.sold },
    { label: "Drafts", value: stats.drafts },
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
            placeholder="Search your listings..."
            aria-label="Search your listings"
          />
          <label className="myacct-sort">
            <span>Sort by:</span>
            <select value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="price-desc">Price: High to Low</option>
              <option value="price-asc">Price: Low to High</option>
            </select>
          </label>
        </div>
      </div>

      {notice && (
        <p className="ce-ok" role="status">
          {notice}
        </p>
      )}
      {loading && <LoadingState label="Loading your listings…" />}
      {error && <ErrorState message={error} onRetry={loadItems} />}
      {!loading && !error && visible.length === 0 && (
        <EmptyState
          title="No listings yet"
          hint="Start selling your first item."
          action={
            <Button variant="primary" size="sm" href="#/sell">
              + Create a Listing
            </Button>
          }
        />
      )}
      {!loading && !error && visible.length > 0 && (
        <>
          <ul className="myacct-listings">
            {pageItems.map((item) => {
              const busy = busyId === item.id;
              return (
                <li key={item.id} className="myacct-listing-row">
                  <span className="myacct-thumb myacct-thumb--lg" aria-hidden="true">
                    <RowThumb item={item} />
                  </span>
                  <div className="myacct-listing-main">
                    <p className="myacct-listing-title">{item.title}</p>
                    <p className="ce-small ce-muted">
                      {item.category?.name ?? "—"}
                      {" · Listed "}
                      {formatDate(item.created_at)}
                    </p>
                  </div>
                  <p className="myacct-listing-price">{priceLabel(item)}</p>
                  <span className="myacct-status">{item.status}</span>
                  <div className="myacct-listing-actions">
                    {item.status === "DRAFT" && (
                      <Button variant="secondary" size="sm" disabled={busy} onClick={() => handlePublish(item)}>
                        Publish
                      </Button>
                    )}
                    {(item.status === "DRAFT" || item.status === "ACTIVE") && (
                      <Button variant="ghost" size="sm" disabled={busy} onClick={() => handleArchive(item)}>
                        Archive
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" href={`#/listing/${item.id}`}>
                      View
                    </Button>
                  </div>
                </li>
              );
            })}
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
