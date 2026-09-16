/**
 * Geometry-matched skeleton for the CE listing card (media + price/title/
 * meta lines). Motion-gated shimmer, aria-hidden with labelled parent.
 */

export default function ListingCardSkeleton() {
  return (
    <div className="ce-lcard" aria-hidden="true">
      <div className="ce-lcard-media">
        <div className="ce-skeleton" style={{ height: "100%", minHeight: "10rem" }} />
      </div>
      <div className="ce-lcard-body">
        <div className="ce-skeleton" style={{ width: "55%" }} />
        <div className="ce-skeleton" style={{ width: "85%", height: "1.25rem" }} />
        <div className="ce-skeleton" style={{ width: "65%" }} />
      </div>
    </div>
  );
}
