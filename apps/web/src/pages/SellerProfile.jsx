import { useEffect, useState } from "react";

import { ApiError } from "../api/client.js";
import { fetchListings, fetchPublicProfile, normalizeListing } from "../api/catalog.js";
import { useAuth } from "../auth/AuthContext.jsx";
import ListingCard from "../components/marketplace/ListingCard.jsx";
import ReportModal from "../components/ReportModal.jsx";
import ReviewsSection from "../components/ReviewsSection.jsx";
import Button from "../components/ui/Button.jsx";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/States.jsx";

export default function SellerProfilePage({ userId, favorites, onToggleFavorite }) {
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
      <div className="ce-stack">
        <LoadingState label="Loading seller profile…" />
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="ce-stack">
        <div>
          <Button variant="ghost" size="sm" href="#/">← Back to listings</Button>
        </div>
        {state.error === "not-found" ? (
          <EmptyState title="Seller not found" hint="This seller profile does not exist or is no longer available." />
        ) : (
          <ErrorState message={state.error} />
        )}
      </div>
    );
  }

  const profile = state.profile;
  const displayName = profile.display_name ?? "Seller";

  return (
    <div className="ce-scope">
      <div className="ce-container ce-stack">
      <div>
        <Button variant="ghost" size="sm" href="#/">← Back to listings</Button>
      </div>

      <div className="ce-card">
        <div className="ce-seller-top">
          <span className="ce-avatar ce-avatar--lg" aria-hidden="true">
            {displayName.charAt(0).toUpperCase()}
          </span>
          <div>
            <h1 className="ce-h1">{displayName}</h1>
            {profile.location && <p className="ce-small ce-muted">📍 {profile.location}</p>}
            {isAuthenticated && (
              <Button variant="ghost" size="sm" onClick={() => setReportOpen(true)}>
                Report this user
              </Button>
            )}
          </div>
        </div>
      </div>
      {reportOpen && (
        <ReportModal
          targetType="user"
          targetId={userId}
          onClose={() => setReportOpen(false)}
        />
      )}

      <section aria-labelledby="seller-listings">
        <div className="ce-section-head">
          <h2 id="seller-listings" className="ce-h2">Active Listings</h2>
          {profile.active_listings_count > 0 && (
            <span className="ce-pill">{profile.active_listings_count}</span>
          )}
        </div>
        {listings.loading && <LoadingState label="Loading listings…" />}
        {!listings.loading && listings.items.length === 0 && (
          <EmptyState title="No active listings" />
        )}
        {listings.items.length > 0 && (
          <div className="ce-grid">
            {listings.items.map((item) => (
              <ListingCard
                key={item.id}
                listing={item}
                isFavorite={favorites?.has(item.id) ?? false}
                onToggleFavorite={onToggleFavorite ?? (() => {})}
              />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="seller-reviews">
        <h2 id="seller-reviews" className="ce-h2">Ratings &amp; Reviews</h2>
        <ReviewsSection authFetch={authFetch} isAuthenticated={isAuthenticated} userId={userId} />
      </section>
      </div>
    </div>
  );
}
