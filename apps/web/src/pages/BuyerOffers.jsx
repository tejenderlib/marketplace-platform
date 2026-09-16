/**
 * Buyer offers: sent offers with status filter, CE table, detail modal.
 * Same fetch/filter/pagination/withdraw/checkout behavior; new presentation.
 */

import { useCallback, useEffect, useState } from "react";

import { ApiError } from "../api/client.js";
import { formatPrice } from "../data/listings.js";
import { myOffers } from "../api/offers.js";
import OfferDetailModal from "../components/OfferDetailModal.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { getOffer, withdrawOffer } from "../api/offers.js";
import Button from "../components/ui/Button.jsx";
import DataTable from "../components/ui/DataTable.jsx";
import Pill from "../components/ui/Pill.jsx";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/States.jsx";

function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

const LIMIT = 20;
const STATUSES = ["", "PENDING", "ACCEPTED", "REJECTED", "WITHDRAWN", "EXPIRED", "CANCELLED"];

function statusLabel(value) {
  if (!value) return "All";
  return value.charAt(0) + value.slice(1).toLowerCase();
}

export default function BuyerOffersPage() {
  const { isAuthenticated, authFetch, redirectToLogin, user } = useAuth();
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);
  const [state, setState] = useState({ loading: true, error: null, items: [], total: 0 });
  const [selectedId, setSelectedId] = useState(null);

  const load = useCallback(async () => {
    setState({ loading: true, error: null, items: [], total: 0 });
    try {
      const data = await myOffers(authFetch, { status: status || undefined, limit: LIMIT, offset });
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
        <p className="ce-small ce-muted">Redirecting to login…</p>
      </div>
    );
  }

  const page = Math.floor(offset / LIMIT) + 1;
  const pages = Math.max(1, Math.ceil(state.total / LIMIT));

  return (
    <div className="ce-stack">
      <div>
        <p className="ce-micro ce-muted">Negotiations you started</p>
        <h1 className="ce-h1">My Offers</h1>
      </div>
      <div className="ce-segmented" role="group" aria-label="Offer status filter">
        {STATUSES.map((value) => (
          <button
            key={value}
            type="button"
            className={status === value ? "ce-btn ce-btn--secondary ce-btn--sm is-active" : "ce-btn ce-btn--ghost ce-btn--sm"}
            aria-pressed={status === value}
            onClick={() => { setStatus(value); setOffset(0); }}
          >
            {statusLabel(value)}
          </button>
        ))}
      </div>
      {state.loading && <LoadingState label="Loading offers…" />}
      {state.error && <ErrorState message={state.error} onRetry={load} />}
      {!state.loading && !state.error && state.items.length === 0 && (
        <EmptyState
          title="No offers yet"
          hint="Make an offer from any fixed-price listing."
          action={<Button variant="secondary" size="sm" href="#/">Browse listings</Button>}
        />
      )}
      {!state.error && state.items.length > 0 && (
        <>
          <DataTable
            caption="My offers"
            columns={[
              { key: "listing", label: "Listing" },
              { key: "amount", label: "Amount", numeric: true },
              { key: "status", label: "Status" },
              { key: "created", label: "Created" },
              { key: "actions", label: "" },
            ]}
            rows={state.items.map((offer) => ({
              key: offer.id,
              listing: <a href={`#/listing/${offer.listing_id}`}>{offer.listing?.title ?? "Listing"}</a>,
              amount: <span className="ce-tnum">{formatPrice(offer.amount_minor)}</span>,
              status: <Pill status={offer.status}>{offer.status}</Pill>,
              created: formatDateTime(offer.created_at),
              actions: (
                <span className="ce-cluster">
                  <Button variant="ghost" size="sm" onClick={() => setSelectedId(offer.id)}>
                    View
                  </Button>
                  {offer.status === "ACCEPTED" && (
                    <Button variant="primary" size="sm" href={`#/checkout/offer/${offer.id}`}>
                      Proceed to checkout
                    </Button>
                  )}
                </span>
              ),
            }))}
          />
          <div className="ce-pagination">
            <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setOffset(offset - LIMIT)} aria-label="Previous page">
              ← Prev
            </Button>
            <span className="ce-small ce-muted ce-tnum" aria-live="polite">
              Page {page} of {pages}
            </span>
            <Button variant="ghost" size="sm" disabled={page >= pages} onClick={() => setOffset(offset + LIMIT)} aria-label="Next page">
              Next →
            </Button>
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
            respond: () => { throw new Error("Only the seller can respond."); },
          }}
          onClose={() => setSelectedId(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
