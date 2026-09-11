import { useCallback, useEffect, useState } from "react";

import { ApiError } from "../api/client.js";
import { formatPrice } from "../data/listings.js";
import { getOffer, respondOffer, sellerOffers, withdrawOffer } from "../api/offers.js";
import OfferDetailModal from "../components/OfferDetailModal.jsx";
import { useAuth } from "../auth/AuthContext.jsx";

function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

const LIMIT = 20;

export default function SellerOffersPage() {
  const { isAuthenticated, authFetch, redirectToLogin, user } = useAuth();
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);
  const [state, setState] = useState({ loading: true, error: null, items: [], total: 0 });
  const [selectedId, setSelectedId] = useState(null);

  const load = useCallback(async () => {
    setState({ loading: true, error: null, items: [], total: 0 });
    try {
      const data = await sellerOffers(authFetch, { status: status || undefined, limit: LIMIT, offset });
      setState({ loading: false, error: null, items: data.items, total: data.total });
    } catch (err) {
      setState({
        loading: false,
        error: err instanceof ApiError ? `Could not load offers (${err.status}).` : "Network error.",
        items: [],
        total: 0,
      });
    }
  }, [authFetch, status, offset]);

  useEffect(() => {
    if (!isAuthenticated) {
      redirectToLogin();
      return;
    }
    load();
  }, [isAuthenticated, load, redirectToLogin]);

  if (!isAuthenticated) {
    return (
      <div className="content">
        <p className="muted">Redirecting to login…</p>
      </div>
    );
  }

  const page = Math.floor(offset / LIMIT) + 1;
  const pages = Math.max(1, Math.ceil(state.total / LIMIT));

  return (
    <div className="content">
      <h1>Seller Offers</h1>
      <p className="muted">Offers received on your listings. Responding is final — please confirm.</p>
      <div className="sale-filter" role="group" aria-label="Offer status filter">
        {["", "PENDING", "ACCEPTED", "REJECTED", "WITHDRAWN", "EXPIRED", "CANCELLED"].map((value) => (
          <button
            key={value}
            type="button"
            className={status === value ? "chip is-active" : "chip"}
            aria-pressed={status === value}
            onClick={() => { setStatus(value); setOffset(0); }}
          >
            {value === "" ? "All" : value}
          </button>
        ))}
      </div>
      {state.loading && <p className="muted" role="status">Loading offers…</p>}
      {state.error && (
        <div className="empty-state" role="alert">
          <p>{state.error}</p>
          <button type="button" className="btn btn-primary" onClick={load}>Retry</button>
        </div>
      )}
      {!state.loading && !state.error && state.items.length === 0 && (
        <div className="empty-state">
          <p>No offers received yet.</p>
        </div>
      )}
      {!state.error && state.items.length > 0 && (
        <>
          <div className="table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Listing</th>
                  <th>Buyer</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {state.items.map((offer) => (
                  <tr key={offer.id}>
                    <td><a href={`#/listing/${offer.listing_id}`}>{offer.listing?.title ?? "Listing"}</a></td>
                    <td>{offer.buyer?.display_name ?? offer.buyer_id.slice(0, 8)}</td>
                    <td>{formatPrice(offer.amount_minor)}</td>
                    <td><span className={`status-pill status-${offer.status}`}>{offer.status}</span></td>
                    <td>{formatDateTime(offer.created_at)}</td>
                    <td>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelectedId(offer.id)}>
                        Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination storefront-pagination">
            <button type="button" className="btn btn-ghost" disabled={page <= 1} onClick={() => setOffset(offset - LIMIT)}>
              ← Prev
            </button>
            <span>Page {page} of {pages}</span>
            <button type="button" className="btn btn-ghost" disabled={page >= pages} onClick={() => setOffset(offset + LIMIT)}>
              Next →
            </button>
          </div>
        </>
      )}
      {selectedId && (
        <OfferDetailModal
          offerId={selectedId}
          currentUserId={user?.id}
          isAdmin={user?.roles?.includes("ADMIN") ?? false}
          api={{
            getOffer: (id) => getOffer(authFetch, id),
            withdraw: (id) => withdrawOffer(authFetch, id),
            respond: (id, offerStatus) => respondOffer(authFetch, id, offerStatus),
          }}
          onClose={() => setSelectedId(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
