import { useEffect, useState } from "react";

import { ApiError } from "../../api/client.js";
import { formatPrice } from "../../data/listings.js";
import { myListings } from "../../api/seller.js";
import { useAuth } from "../../auth/AuthContext.jsx";

function statusPillClass(status) {
  switch (status) {
    case "ACTIVE":
    case "DRAFT":
      return "pill pill-active";
    case "PENDING_REVIEW":
      return "pill pill-ending";
    case "RESERVED":
      return "pill pill-auction";
    case "SOLD":
      return "pill pill-sold";
    case "REJECTED":
    case "REMOVED":
    case "EXPIRED":
      return "pill pill-cancelled";
    default:
      return "pill";
  }
}

/**
 * My Listings workspace view: a compact live summary of the seller's own
 * listings. Full management (edit, submit, archive, images, wizard) stays
 * in the existing Seller Hub — linked, not duplicated.
 */
export default function AccountListings() {
  const { authFetch } = useAuth();
  const [state, setState] = useState({ loading: true, error: null, items: [], total: 0 });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await myListings(authFetch, { limit: 6, offset: 0 });
        if (!alive) return;
        setState({ loading: false, error: null, items: data.items ?? [], total: data.total ?? 0 });
      } catch (err) {
        if (!alive) return;
        setState({
          loading: false,
          error: err instanceof ApiError ? `Could not load listings (${err.status}).` : "Network error.",
          items: [],
          total: 0,
        });
      }
    })();
    return () => {
      alive = false;
    };
  }, [authFetch]);

  return (
    <section aria-labelledby="acct-listings-heading">
      <div className="section-head">
        <h2 id="acct-listings-heading">My Listings</h2>
        <a className="btn btn-sell btn-sm" href="#/sell">+ New Listing</a>
      </div>
      {state.loading && <p className="muted" role="status">Loading listings…</p>}
      {state.error && (
        <div className="empty-state" role="alert">
          <p>{state.error}</p>
        </div>
      )}
      {!state.loading && !state.error && state.items.length === 0 && (
        <div className="empty-state">
          <p>You have no listings yet.</p>
          <a className="btn btn-primary" href="#/sell">Create your first listing</a>
        </div>
      )}
      {state.items.length > 0 && (
        <ul className="sell-list">
          {state.items.map((item) => (
            <li key={item.id} className="sell-item">
              <div className="sell-item-main">
                <p className="sell-item-title">{item.title}</p>
                <p className="muted small">
                  {item.sale_type === "AUCTION"
                    ? "Auction"
                    : item.fixed_price_minor != null
                      ? formatPrice(item.fixed_price_minor)
                      : "—"}
                  {" · "}
                  {item.category?.name ?? "—"}
                </p>
              </div>
              <span className={statusPillClass(item.status)}>
                {item.status.split("_").map((part) => part.charAt(0) + part.slice(1).toLowerCase()).join(" ")}
              </span>
            </li>
          ))}
        </ul>
      )}
      {state.total > state.items.length && (
        <p className="muted small">Showing {state.items.length} of {state.total}.</p>
      )}
      <div className="card-actions">
        <a className="btn btn-ghost" href="#/sell">Manage in Seller Hub</a>
      </div>
    </section>
  );
}
