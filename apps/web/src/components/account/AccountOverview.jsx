import { useEffect, useState } from "react";

import { ApiError } from "../../api/client.js";
import { formatPrice } from "../../data/listings.js";
import { myOrders } from "../../api/checkout.js";
import { myOffers } from "../../api/offers.js";
import { useAuth } from "../../auth/AuthContext.jsx";

/**
 * Account overview dashboard. All metrics are real totals/lists from
 * existing endpoints; areas with full pages link out instead of
 * duplicating them.
 */
export default function AccountOverview({ favoriteCount }) {
  const { authFetch } = useAuth();
  const [offers, setOffers] = useState({ loading: true, items: [], total: 0 });
  const [orders, setOrders] = useState({ loading: true, items: [], total: 0 });
  const [listingTotal, setListingTotal] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [offerData, orderData, listingData] = await Promise.all([
          myOffers(authFetch, { limit: 5, offset: 0 }),
          myOrders(authFetch, { limit: 5, offset: 0 }),
          authFetch("/catalog/listings/mine?limit=1&offset=0"),
        ]);
        if (!alive) return;
        setOffers({ loading: false, items: offerData.items, total: offerData.total ?? offerData.items.length });
        setOrders({ loading: false, items: orderData.items, total: orderData.total ?? orderData.items.length });
        setListingTotal(listingData.total ?? 0);
      } catch (err) {
        if (!alive) return;
        if (!(err instanceof ApiError)) {
          setOffers({ loading: false, items: [], total: 0 });
          setOrders({ loading: false, items: [], total: 0 });
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [authFetch]);

  const stats = [
    { label: "Listings", value: listingTotal ?? "…", href: "#/profile/listings" },
    { label: "Offers", value: offers.loading ? "…" : offers.total, href: "#/profile/offers" },
    { label: "Orders", value: orders.loading ? "…" : orders.total, href: "#/profile/orders" },
    { label: "Favorites", value: favoriteCount, href: "#/profile/favorites" },
  ];

  return (
    <>
      <section aria-labelledby="acct-stats-heading">
        <h2 id="acct-stats-heading" className="visually-hidden">Account summary</h2>
        <ul className="acct-stats">
          {stats.map((stat) => (
            <li key={stat.label}>
              <a className="acct-stat" href={stat.href}>
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className="acct-section" aria-labelledby="acct-actions-heading">
        <h2 id="acct-actions-heading">Quick actions</h2>
        <div className="card-actions">
          <a className="btn btn-sell" href="#/sell">Sell an item</a>
          <a className="btn btn-ghost" href="#/profile/listings">My listings</a>
          <a className="btn btn-ghost" href="#/profile/orders">My orders</a>
          <a className="btn btn-ghost" href="#/profile/messages">Messages</a>
        </div>
      </section>

      <section className="acct-section" aria-labelledby="acct-recent-orders">
        <div className="section-head">
          <h2 id="acct-recent-orders">Recent orders</h2>
          <a className="btn btn-ghost btn-sm" href="#/profile/orders">View all</a>
        </div>
        {orders.loading && <p className="muted" role="status">Loading orders…</p>}
        {!orders.loading && orders.items.length === 0 && (
          <p className="muted">No orders yet.</p>
        )}
        {orders.items.length > 0 && (
          <ul className="acct-rows">
            {orders.items.map((order) => (
              <li key={order.id}>
                <a href={`#/orders/${order.id}`}>{order.listing_title_snapshot}</a>{" "}
                <strong>{formatPrice(order.total_minor)}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="acct-section" aria-labelledby="acct-recent-offers">
        <div className="section-head">
          <h2 id="acct-recent-offers">Recent offers</h2>
          <a className="btn btn-ghost btn-sm" href="#/profile/offers">View all</a>
        </div>
        {offers.loading && <p className="muted" role="status">Loading offers…</p>}
        {!offers.loading && offers.items.length === 0 && (
          <p className="muted">No offers yet.</p>
        )}
        {offers.items.length > 0 && (
          <ul className="acct-rows">
            {offers.items.map((offer) => (
              <li key={offer.id}>
                <strong>{formatPrice(offer.amount_minor)}</strong>{" "}
                <span className={`status-pill status-${offer.status}`}>{offer.status}</span>{" "}
                <span className="muted small">{offer.listing?.title}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="muted small">
          Selling? <a href="#/seller/offers">View offers received</a>.
        </p>
      </section>
    </>
  );
}
