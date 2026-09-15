import { useCallback, useEffect, useState } from "react";

import { ApiError } from "../api/client.js";
import { getOrder, myOrders } from "../api/checkout.js";
import { myOffers } from "../api/offers.js";
import { myListings } from "../api/seller.js";
import { createTicket, listMyTickets } from "../api/support.js";
import { formatPrice } from "../data/listings.js";
import { useAuth } from "../auth/AuthContext.jsx";
import ContextObjectPicker from "../components/support/ContextObjectPicker.jsx";
import SupportCategoryGrid from "../components/support/SupportCategoryGrid.jsx";
import SupportHeader from "../components/support/SupportHeader.jsx";
import TicketCard from "../components/support/TicketCard.jsx";
import { shortRef } from "../components/support/supportContext.js";

const LIMIT = 20;
const DESCRIPTION_MAX = 5000;

function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

const CATEGORY_META = {
  orders: { kind: "Order", title: "Orders", selectLabel: "Select an order" },
  payments: { kind: "Payment", title: "Payments", selectLabel: "Select a payment" },
  listings: { kind: "Listing", title: "Listings", selectLabel: "Select a listing" },
  buying: { kind: "Offer", title: "Buying", selectLabel: "Select one of your offers" },
  selling: { kind: "Listing", title: "Selling", selectLabel: "Select one of your listings" },
  account: { kind: "Account", title: "Account", selectLabel: null },
};

export default function SupportPage({ detailBase = "/support" }) {
  const { isAuthenticated, authFetch, redirectToLogin } = useAuth();
  const [offset, setOffset] = useState(0);
  const [state, setState] = useState({ loading: true, error: null, items: [], total: 0 });
  const [category, setCategory] = useState(null);
  const [objects, setObjects] = useState({ loading: false, error: null, items: [] });
  const [selectedId, setSelectedId] = useState(null);
  const [message, setMessage] = useState("");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState(null);
  const [createdNote, setCreatedNote] = useState(null);

  const load = useCallback(async () => {
    if (!isAuthenticated) return;
    setState({ loading: true, error: null, items: [], total: 0 });
    try {
      const data = await listMyTickets(authFetch, { limit: LIMIT, offset });
      setState({ loading: false, error: null, items: data.items, total: data.total });
    } catch (err) {
      setState({
        loading: false,
        error: err instanceof ApiError ? `Could not load support tickets (${err.status}).` : "Network error.",
        items: [],
        total: 0,
      });
    }
  }, [isAuthenticated, authFetch, offset]);

  useEffect(() => {
    if (!isAuthenticated) {
      redirectToLogin();
      return;
    }
    load();
  }, [isAuthenticated, load, redirectToLogin]);

  useEffect(() => {
    if (!isAuthenticated || !category || category === "account") return;
    let alive = true;
    setObjects({ loading: true, error: null, items: [] });
    setSelectedId(null);
    setMessage("");
    setFormError(null);
    (async () => {
      try {
        const items = await loadCategoryObjects(authFetch, category);
        if (alive) setObjects({ loading: false, error: null, items });
      } catch (err) {
        if (alive) {
          setObjects({
            loading: false,
            error: err instanceof ApiError ? `Could not load records (${err.status}).` : "Network error.",
            items: [],
          });
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [isAuthenticated, authFetch, category]);

  if (!isAuthenticated) {
    return (
      <div className="content">
        <p className="muted">Redirecting to login…</p>
      </div>
    );
  }

  const selected = objects.items.find((item) => item.id === selectedId) ?? null;
  const meta = category ? CATEGORY_META[category] : null;

  function chooseCategory(next) {
    setCategory(next);
    setSelectedId(null);
    setMessage("");
    setFormError(null);
    setCreatedNote(null);
  }

  async function handleCreate(event) {
    event.preventDefault();
    const body = message.trim();
    if (!body || creating) return;
    if (category !== "account" && !selected) {
      setFormError("Select an item above first.");
      return;
    }
    setCreating(true);
    setFormError(null);
    setCreatedNote(null);
    try {
      const { subject, header } = buildTicketText(category, selected);
      await createTicket(authFetch, { subject, description: `${header}\n\n${body}` });
      setCategory(null);
      setSelectedId(null);
      setMessage("");
      setCreatedNote("Support request sent. We will reply on the ticket.");
      setOffset(0);
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not create the ticket.");
    } finally {
      setCreating(false);
    }
  }

  const page = Math.floor(offset / LIMIT) + 1;
  const pages = Math.max(1, Math.ceil(state.total / LIMIT));
  const headerPreview = selected || category === "account" ? buildTicketText(category, selected, "").header : "";
  const messageMax = Math.max(100, DESCRIPTION_MAX - headerPreview.length - 2);

  return (
    <div className="content">
      <SupportHeader />

      <section aria-labelledby="support-category-heading">
        <h2 id="support-category-heading">What do you need help with?</h2>
        <SupportCategoryGrid
          selected={category}
          onSelect={(next) => chooseCategory(category === next ? null : next)}
        />
      </section>

      {createdNote && (
        <p className="form-ok" role="status">{createdNote}</p>
      )}

      {category && meta && (
        <section className="detail-card" aria-labelledby="support-flow-heading">
          <div className="support-form-head">
            <h2 id="support-flow-heading">{meta.title}</h2>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => chooseCategory(null)}>
              ← All topics
            </button>
          </div>

          {category === "account" ? (
            <form onSubmit={handleCreate} className="stack-form">
              {formError && <p className="form-error" role="alert">{formError}</p>}
              <label className="field" htmlFor="support-account-message">
                <span>Describe the problem <span aria-hidden="true">*</span></span>
                <textarea
                  id="support-account-message"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Login, profile, settings, verification…"
                  rows={4}
                  maxLength={messageMax}
                  required
                />
                <span className="muted small" aria-live="polite">{message.length}/{messageMax} characters</span>
              </label>
              <button type="submit" className="btn btn-primary" disabled={creating || !message.trim()}>
                {creating ? "Submitting…" : "Submit support request"}
              </button>
            </form>
          ) : objects.loading ? (
            <p className="muted" role="status">Loading your records…</p>
          ) : objects.error ? (
            <div className="empty-state" role="alert">
              <p>{objects.error}</p>
            </div>
          ) : objects.items.length === 0 ? (
            <div className="empty-state">
              <p>No {meta.title.toLowerCase()} found on your account yet.</p>
            </div>
          ) : (
            <form onSubmit={handleCreate}>
              {formError && <p className="form-error" role="alert">{formError}</p>}
              <ContextObjectPicker
                items={objects.items}
                selectedId={selectedId}
                onSelect={setSelectedId}
                legend={meta.selectLabel}
              />
              {selected && (
                <>
                  <div className="support-selected">
                    <div>
                      <strong>{selected.title}</strong>
                      <span className="muted small">{selected.ref}{selected.meta ? ` · ${selected.meta}` : ""}</span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setSelectedId(null)}
                    >
                      Change
                    </button>
                  </div>
                  <label className="field" htmlFor="support-context-message">
                    <span>Describe the problem <span aria-hidden="true">*</span></span>
                    <textarea
                      id="support-context-message"
                      value={message}
                      onChange={(event) => setMessage(event.target.value)}
                      placeholder={`What is wrong with ${selected.title}?`}
                      rows={4}
                      maxLength={messageMax}
                      required
                    />
                    <span className="muted small" aria-live="polite">{message.length}/{messageMax} characters</span>
                  </label>
                  <button type="submit" className="btn btn-primary" disabled={creating || !message.trim()}>
                    {creating ? "Submitting…" : "Submit support request"}
                  </button>
                </>
              )}
            </form>
          )}
        </section>
      )}

      <section aria-labelledby="support-tickets-heading">
        <div className="section-head">
          <h2 id="support-tickets-heading">My Tickets</h2>
          {state.total > 0 && <span className="pill">{state.total}</span>}
        </div>
        {state.loading && (
          <ul className="order-list" aria-label="Loading tickets">
            {[0, 1, 2].map((key) => (
              <li key={key} className="order-card" aria-hidden="true">
                <div className="order-main">
                  <div className="skeleton-block skeleton-line" style={{ width: "60%" }} />
                  <div className="skeleton-block skeleton-line" style={{ width: "40%" }} />
                </div>
              </li>
            ))}
          </ul>
        )}
        {!state.loading && state.error && (
          <div className="empty-state" role="alert">
            <p>{state.error}</p>
            <button type="button" className="btn btn-primary" onClick={load}>Retry</button>
          </div>
        )}
        {!state.loading && !state.error && state.items.length === 0 && (
          <div className="empty-state">
            <p>You haven&apos;t opened any support tickets yet.</p>
          </div>
        )}
        {state.items.length > 0 && (
          <>
            <ul className="order-list">
              {state.items.map((ticket) => (
                <TicketCard key={ticket.id} ticket={ticket} detailBase={detailBase} />
              ))}
            </ul>
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
      </section>
    </div>
  );
}

function pillFor(text, className) {
  return text ? { text, className } : null;
}

async function loadCategoryObjects(authFetch, category) {
  if (category === "orders") {
    const data = await myOrders(authFetch, { limit: 20, offset: 0 });
    return (data.items ?? []).map((order) => ({
      id: order.id,
      title: order.listing_title_snapshot ?? "Order",
      ref: shortRef(order.id),
      meta: `${formatPrice(order.total_minor)} · ${order.status}`,
      sub: `Ordered ${formatDate(order.created_at)}`,
      pill: pillFor(order.status, "pill"),
      headerMeta: `${formatPrice(order.total_minor)} · ${order.status}`,
    }));
  }
  if (category === "payments") {
    const data = await myOrders(authFetch, { limit: 10, offset: 0 });
    const details = await Promise.all(
      (data.items ?? []).map((order) => getOrder(authFetch, order.id).catch(() => null)),
    );
    const items = [];
    for (const detail of details) {
      if (!detail) continue;
      for (const payment of detail.payments ?? []) {
        items.push({
          id: payment.id,
          title: `Payment ${shortRef(payment.id)}`,
          ref: `Order ${shortRef(detail.id)}`,
          meta: `${formatPrice(payment.amount_minor)} · ${payment.status}`,
          sub: `${detail.listing_title_snapshot ?? "Order"} · ${formatDate(detail.created_at)}`,
          pill: pillFor(payment.status, "pill"),
          headerMeta: `${formatPrice(payment.amount_minor)} · ${payment.status}`,
        });
      }
    }
    return items;
  }
  if (category === "listings" || category === "selling") {
    const data = await myListings(authFetch, { limit: 20, offset: 0 });
    return (data.items ?? []).map((listing) => ({
      id: listing.id,
      title: listing.title ?? "Listing",
      ref: shortRef(listing.id),
      meta: `${listing.status} · ${listing.sale_type === "AUCTION" ? "Auction" : "Fixed price"}`,
      sub: `Posted ${formatDate(listing.created_at)}`,
      pill: pillFor(listing.status, "pill"),
      headerMeta: `${listing.status}`,
    }));
  }
  if (category === "buying") {
    const data = await myOffers(authFetch, { limit: 20, offset: 0 });
    return (data.items ?? []).map((offer) => ({
      id: offer.id,
      title: offer.listing?.title ?? "Offer",
      ref: shortRef(offer.id),
      meta: `${formatPrice(offer.amount_minor)} · ${offer.status}`,
      sub: `Sent ${formatDate(offer.created_at)}`,
      pill: pillFor(offer.status, "pill"),
      headerMeta: `${formatPrice(offer.amount_minor)} · ${offer.status}`,
    }));
  }
  return [];
}

function buildTicketText(category, selected) {
  if (category === "account" || !selected) {
    return { subject: "Account help", header: "[Account]" };
  }
  const kind = CATEGORY_META[category].kind;
  const header = selected.headerMeta
    ? `[${kind} ${selected.ref} · ${selected.headerMeta}]`
    : `[${kind} ${selected.ref}]`;
  return { subject: `[${kind} ${selected.ref}]`, header };
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
