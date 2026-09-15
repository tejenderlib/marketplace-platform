import { useCallback, useEffect, useState } from "react";

import { ApiError } from "../api/client.js";
import { formatPrice } from "../data/listings.js";
import { myOrders } from "../api/checkout.js";
import { myOffers } from "../api/offers.js";
import { useAuth } from "../auth/AuthContext.jsx";
import ListingCard from "../components/ListingCard.jsx";
import ReviewsSection from "../components/ReviewsSection.jsx";
import { normalizeListing } from "../api/catalog.js";

function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

const PRESET_AVATARS = [
  { key: "blue", color: "#2563eb" },
  { key: "green", color: "#16a34a" },
  { key: "red", color: "#dc2626" },
  { key: "purple", color: "#7c3aed" },
  { key: "orange", color: "#ea580c" },
  { key: "teal", color: "#0d9488" },
];

function AvatarItem({ avatar, selected, onSelect }) {
  return (
    <button
      type="button"
      className={selected ? "avatar-item is-selected" : "avatar-item"}
      style={{ background: avatar.color }}
      onClick={onSelect}
      aria-label={`Avatar color ${avatar.key}`}
      aria-pressed={selected}
      title={`Avatar color ${avatar.key}`}
    >
      {selected ? "✓" : ""}
    </button>
  );
}

function useProfileListings(userId) {
  const { authFetch } = useAuth();
  const [state, setState] = useState({ loading: true, error: null, items: [], total: 0 });
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const params = new URLSearchParams({ limit: 6, offset: 0 });
        const data = await authFetch(`/catalog/listings/mine?${params}`);
        if (!alive) return;
        setState({ loading: false, error: null, items: data.items.map(normalizeListing), total: data.total });
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
  }, [authFetch, userId]);
  return state;
}

export default function ProfilePage() {
  const { isAuthenticated, authFetch, redirectToLogin, user, reloadUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ display_name: "" });
  const [selectedAvatarKey, setSelectedAvatarKey] = useState(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [location, setLocation] = useState(null);
  const [offers, setOffers] = useState({ loading: true, items: [] });
  const [orders, setOrders] = useState({ loading: true, items: [] });
  const listings = useProfileListings(user?.id);

  useEffect(() => {
    if (!isAuthenticated) {
      redirectToLogin();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !user) return;
    setForm({
      display_name: user.profile?.display_name ?? "",
    });
    setSelectedAvatarKey(user.profile?.avatar_url ?? null);
    let alive = true;
    (async () => {
      try {
        const [offerData, orderData, addresses] = await Promise.all([
          myOffers(authFetch, { limit: 5, offset: 0 }),
          myOrders(authFetch, { limit: 5, offset: 0 }),
          authFetch("/addresses"),
        ]);
        if (!alive) return;
        setOffers({ loading: false, items: offerData.items });
        setOrders({ loading: false, items: orderData.items });
        const def = addresses.find((a) => a.is_default) ?? addresses[0];
        if (def) {
          setLocation([def.city, def.region, def.country].filter(Boolean).join(", "));
        }
      } catch {
        if (!alive) return;
        setOffers({ loading: false, items: [] });
        setOrders({ loading: false, items: [] });
      }
    })();
    return () => {
      alive = false;
    };
  }, [isAuthenticated, authFetch, user]);

  if (!isAuthenticated) {
    return (
      <div className="content">
        <p className="muted">Redirecting to login…</p>
      </div>
    );
  }

  const saveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    const payload = {};
    const value = form.display_name.trim();
    payload.display_name = value === "" ? null : value;
    payload.avatar_key = selectedAvatarKey;
    try {
      await authFetch("/users/me/profile", { method: "PATCH", body: payload });
      await reloadUser();
      setEditing(false);
      setFeedback({ kind: "ok", text: "Profile updated." });
    } catch (err) {
      setFeedback({
        kind: "error",
        text: err instanceof ApiError ? `Could not save profile (${err.status}): ${err.message}` : "Network error.",
      });
    } finally {
      setSaving(false);
    }
  };

  const displayName = user?.profile?.display_name ?? user?.email?.split("@")[0] ?? "Account";
  const currentAvatar = PRESET_AVATARS.find((a) => a.key === user?.profile?.avatar_url) ?? null;

  return (
    <div className="content">
      <div className="detail-card profile-hero">
        <span className="profile-avatar" aria-hidden="true" style={currentAvatar ? { background: currentAvatar.color } : undefined}>
          {displayName.charAt(0).toUpperCase()}
        </span>
        <div>
          <h1>{displayName}</h1>
          <p className="muted">{user?.email}</p>
          {location && <p className="muted">📍 {location}</p>}
          <p>
            <span className="pill">{user?.status}</span>{" "}
            {(user?.roles ?? []).map((role) => (
              <span key={role} className="pill">{role}</span>
            ))}
          </p>
        </div>
        <div>
          <button type="button" className="btn btn-ghost" onClick={() => { setFeedback(null); setEditing((v) => !v); }}>
            {editing ? "Cancel" : "Edit profile"}
          </button>
        </div>
      </div>
      {feedback && (
        <p className={feedback.kind === "error" ? "form-error" : "form-ok"} role="status">
          {feedback.text}
        </p>
      )}

      {editing && (
        <form className="detail-card" onSubmit={saveProfile}>
          <h2>Edit profile</h2>
          <div className="form-grid">
            <label><span>Display name</span>
              <input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} maxLength={120} placeholder="At least 2 characters" />
            </label>
            <label><span>Avatar</span>
              <div className="avatar-grid">
                {PRESET_AVATARS.map((avatar) => (
                  <AvatarItem
                    key={avatar.key}
                    avatar={avatar}
                    selected={selectedAvatarKey === avatar.key}
                    onSelect={() => setSelectedAvatarKey(avatar.key)}
                  />
                ))}
              </div>
            </label>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </button>
              <p className="muted small">Display name and avatar are editable. Changes apply instantly.</p>
          </div>
        </form>
      )}

      <section className="section" aria-labelledby="profile-listings">
        <div className="section-head">
          <h2 id="profile-listings">My Listings</h2>
          <a className="btn btn-ghost btn-sm" href="#/">Browse all</a>
        </div>
        {listings.loading && <p className="muted" role="status">Loading listings…</p>}
        {listings.error && <p className="form-error">{listings.error}</p>}
        {!listings.loading && !listings.error && listings.items.length === 0 && (
          <div className="empty-state"><p>You have no listings yet.</p></div>
        )}
        {listings.items.length > 0 && (
          <div className="listing-grid">
            {listings.items.map((item) => (
              <ListingCard key={item.id} listing={item} isFavorite={false} onToggleFavorite={() => {}} />
            ))}
          </div>
        )}
      </section>

      <section className="section" aria-labelledby="profile-offers">
        <div className="section-head">
          <h2 id="profile-offers">My Offers</h2>
          <a className="btn btn-ghost btn-sm" href="#/offers">View all</a>
        </div>
        {offers.loading && <p className="muted" role="status">Loading offers…</p>}
        {!offers.loading && offers.items.length === 0 && (
          <div className="empty-state"><p>No offers yet.</p></div>
        )}
        {offers.items.length > 0 && (
          <ul className="kv-list">
            {offers.items.map((offer) => (
              <li key={offer.id}>
                <strong>{formatPrice(offer.amount_minor)}</strong>{" "}
                <span className={`status-pill status-${offer.status}`}>{offer.status}</span>{" "}
                <span className="muted small">{offer.listing?.title}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section" aria-labelledby="profile-orders">
        <div className="section-head">
          <h2 id="profile-orders">My Orders</h2>
          <a className="btn btn-ghost btn-sm" href="#/orders">View all</a>
        </div>
        {orders.loading && <p className="muted" role="status">Loading orders…</p>}
        {!orders.loading && orders.items.length === 0 && (
          <div className="empty-state"><p>No orders yet.</p></div>
        )}
        {orders.items.length > 0 && (
          <ul className="kv-list">
            {orders.items.map((order) => (
              <li key={order.id}>
                <a href={`#/orders/${order.id}`}>{order.listing_title_snapshot}</a>{" "}
                <strong>{formatPrice(order.total_minor)}</strong>{" "}
                <span className="pill">{order.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section" aria-labelledby="profile-reviews">
        <div className="section-head">
          <h2 id="profile-reviews">Ratings &amp; Reviews</h2>
        </div>
        <ReviewsSection authFetch={authFetch} isAuthenticated={isAuthenticated} userId={user?.id} />
      </section>

      <section className="section" aria-labelledby="profile-links">
        <div className="section-head">
          <h2 id="profile-links">Quick Links</h2>
        </div>
        <div className="detail-card">
          <div className="card-actions">
            <a className="btn btn-ghost btn-sm" href="#/notifications">Notifications</a>
            <a className="btn btn-ghost btn-sm" href="#/messages">Messages</a>
            <a className="btn btn-ghost btn-sm" href="#/reports">My Reports</a>
            <a className="btn btn-ghost btn-sm" href="#/support">Support</a>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="profile-settings">
        <div className="section-head">
          <h2 id="profile-settings">Account Settings</h2>
        </div>
        <div className="detail-card">
          <p className="muted">Additional account settings are coming soon. Nothing to configure here yet.</p>
        </div>
      </section>
    </div>
  );
}
