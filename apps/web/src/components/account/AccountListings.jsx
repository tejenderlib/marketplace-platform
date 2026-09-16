import { useEffect, useState } from "react";

import { ApiError } from "../../api/client.js";
import { formatPrice } from "../../data/listings.js";
import { myListings } from "../../api/seller.js";
import { useAuth } from "../../auth/AuthContext.jsx";
import Button from "../ui/Button.jsx";
import Pill from "../ui/Pill.jsx";
import { pillLabel } from "../ui/Pill.jsx";
import { EmptyState, ErrorState, LoadingState } from "../ui/States.jsx";

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
    <section aria-labelledby="acct-listings-heading" className="ce-stack">
      <div className="ce-section-head">
        <h2 id="acct-listings-heading" className="ce-h2">My Listings</h2>
        <Button variant="primary" size="sm" href="#/sell">+ New Listing</Button>
      </div>
      {state.loading && <LoadingState label="Loading listings…" />}
      {state.error && <ErrorState message={state.error} />}
      {!state.loading && !state.error && state.items.length === 0 && (
        <EmptyState
          title="You have no listings yet"
          action={<Button variant="primary" size="sm" href="#/sell">Create your first listing</Button>}
        />
      )}
      {state.items.length > 0 && (
        <ul className="ce-sell-list">
          {state.items.map((item) => (
            <li key={item.id} className="ce-sell-item">
              <div className="ce-sell-item-main">
                <p className="ce-sell-item-title">{item.title}</p>
                <p className="ce-small ce-muted">
                  {item.sale_type === "AUCTION"
                    ? "Auction"
                    : item.fixed_price_minor != null
                      ? formatPrice(item.fixed_price_minor)
                      : "—"}
                  {" · "}
                  {item.category?.name ?? "—"}
                </p>
              </div>
              <Pill status={item.status}>{pillLabel(item.status)}</Pill>
            </li>
          ))}
        </ul>
      )}
      {state.total > state.items.length && (
        <p className="ce-small ce-muted">Showing {state.items.length} of {state.total}.</p>
      )}
      <div>
        <Button variant="ghost" size="sm" href="#/sell">Manage in Seller Hub</Button>
      </div>
    </section>
  );
}
