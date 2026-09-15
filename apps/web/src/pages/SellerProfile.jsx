import { useEffect, useState } from "react";

import { ApiError } from "../api/client.js";
import { fetchListings, fetchPublicProfile, normalizeListing } from "../api/catalog.js";
import { useAuth } from "../auth/AuthContext.jsx";
import ListingCard from "../components/ListingCard.jsx";
import ReportModal from "../components/ReportModal.jsx";
import ReviewsSection from "../components/ReviewsSection.jsx";

export default function SellerProfilePage({ userId }) {
  const { isAuthenticated, authFetch } = useAuth();
  const [state, setState] = useState({ loading: true, error: null, profile: null });
  const [listings, setListings] = useState({ loading: true, items: [] });
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setState({ loading: true, error: null, profile: null });
      setListings({ loading: true, items: [] });
      try {
        const [profile, listingData] = await Promise.all([
          fetchPublicProfile(userId),
          fetchListings({ seller_id: userId, status: "ACTIVE", limit: 12, offset: 0 }),
        ]);
        if (!alive) return;
        setState({ loading: false, error: null, profile });
        setListings({ loading: false, items: listingData.items.map(normalizeListing) });
      } catch (err) {
        if (!alive) return;
        const notFound = err instanceof ApiError && err.status === 404;
        setState({
          loading: false,
          error: notFound ? "not-found" : (err instanceof ApiError ? `Could not load profile (${err.status}).` : "Network error."),
          profile: null,
        });
        setListings({ loading: false, items: [] });
      }
    })();
    return () => {
      alive = false;
    };
  }, [userId]);

  if (state.loading) {
    return (
      <div className="content">
        <p className="muted" role="status">Loading seller profile…</p>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="content">
        <a className="back-link" href="#/">← Back to listings</a>
        {state.error === "not-found" ? (
          <div className="empty-state">
            <p>This seller profile does not exist or is no longer available.</p>
          </div>
        ) : (
          <div className="empty-state" role="alert">
            <p>{state.error}</p>
          </div>
        )}
      </div>
    );
  }

  const profile = state.profile;
  const displayName = profile.display_name ?? "Seller";

  return (
    <div className="content">
      <a className="back-link" href="#/">← Back to listings</a>

      <div className="detail-card profile-hero">
        <span className="profile-avatar" aria-hidden="true">
          {displayName.charAt(0).toUpperCase()}
        </span>
        <div>
          <h1>{displayName}</h1>
          {profile.location && <p className="muted">📍 {profile.location}</p>}
          {isAuthenticated && (
            <button type="button" className="btn btn-ghost btn-sm btn-report" onClick={() => setReportOpen(true)}>
              Report this user
            </button>
          )}
        </div>
      </div>
      {reportOpen && (
        <ReportModal
          targetType="user"
          targetId={userId}
          onClose={() => setReportOpen(false)}
        />
      )}

      <section className="section" aria-labelledby="seller-listings">
        <div className="section-head">
          <h2 id="seller-listings">Active Listings</h2>
          {profile.active_listings_count > 0 && (
            <span className="pill">{profile.active_listings_count}</span>
          )}
        </div>
        {listings.loading && <p className="muted" role="status">Loading listings…</p>}
        {!listings.loading && listings.items.length === 0 && (
          <div className="empty-state"><p>No active listings.</p></div>
        )}
        {listings.items.length > 0 && (
          <div className="listing-grid">
            {listings.items.map((item) => (
              <ListingCard key={item.id} listing={item} isFavorite={false} onToggleFavorite={() => {}} interactive={false} />
            ))}
          </div>
        )}
      </section>

      <section className="section" aria-labelledby="seller-reviews">
        <div className="section-head">
          <h2 id="seller-reviews">Ratings &amp; Reviews</h2>
        </div>
        <ReviewsSection authFetch={authFetch} isAuthenticated={isAuthenticated} userId={userId} />
      </section>
    </div>
  );
}
