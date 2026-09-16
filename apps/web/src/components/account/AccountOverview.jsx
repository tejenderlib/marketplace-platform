import { useEffect, useState } from "react";

import { ApiError } from "../../api/client.js";
import { formatPrice } from "../../data/listings.js";
import { myOrders } from "../../api/checkout.js";
import { myOffers } from "../../api/offers.js";
import { useAuth } from "../../auth/AuthContext.jsx";
import Button from "../ui/Button.jsx";
import Pill from "../ui/Pill.jsx";
import { LoadingState } from "../ui/States.jsx";

/**
 * Account overview: next actions + recent activity. All figures are real
 * totals/lists from existing endpoints; full pages link out.
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
    <div className="ce-stack">
      <section aria-labelledby="acct-stats-heading">
        <h2 id="acct-stats-heading" className="ce-visually-hidden">Account summary</h2>
        <ul className="ce-stat-grid">
          {stats.map((stat) => (
            <li key={stat.label}>
              <a href={stat.href}>
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="acct-actions-heading">
        <h2 id="acct-actions-heading" className="ce-h3">Quick actions</h2>
        <div className="ce-cluster">
          <Button variant="primary" size="sm" href="#/sell">Sell an item</Button>
          <Button variant="ghost" size="sm" href="#/profile/listings">My listings</Button>
          <Button variant="ghost" size="sm" href="#/profile/orders">My orders</Button>
          <Button variant="ghost" size="sm" href="#/profile/messages">Messages</Button>
        </div>
      </section>

      <section aria-labelledby="acct-recent-orders">
        <div className="ce-section-head">
          <h2 id="acct-recent-orders" className="ce-h3">Recent orders</h2>
          <Button variant="ghost" size="sm" href="#/profile/orders">View all</Button>
        </div>
        {orders.loading && <LoadingState label="Loading orders…" />}
        {!orders.loading && orders.items.length === 0 && (
          <p className="ce-small ce-muted">No orders yet.</p>
        )}
        {orders.items.length > 0 && (
          <ul className="ce-rows">
            {orders.items.map((order) => (
              <li key={order.id}>
                <a href={`#/orders/${order.id}`}>{order.listing_title_snapshot}</a>
                <strong className="ce-tnum">{formatPrice(order.total_minor)}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="acct-recent-offers">
        <div className="ce-section-head">
          <h2 id="acct-recent-offers" className="ce-h3">Recent offers</h2>
          <Button variant="ghost" size="sm" href="#/profile/offers">View all</Button>
        </div>
        {offers.loading && <LoadingState label="Loading offers…" />}
        {!offers.loading && offers.items.length === 0 && (
          <p className="ce-small ce-muted">No offers yet.</p>
        )}
        {offers.items.length > 0 && (
          <ul className="ce-rows">
            {offers.items.map((offer) => (
              <li key={offer.id}>
                <strong className="ce-tnum">{formatPrice(offer.amount_minor)}</strong>
                <Pill status={offer.status}>{offer.status}</Pill>
                <span className="ce-small ce-muted">{offer.listing?.title}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="ce-small ce-muted">
          Selling? <a href="#/seller/offers">View offers received</a>.
        </p>
      </section>
    </div>
  );
}
