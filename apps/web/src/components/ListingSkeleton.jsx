/**
 * Loading placeholder mirroring the listing-card silhouette (media block,
 * price/title/meta lines). Pure CSS shimmer, disabled under
 * prefers-reduced-motion. Rendered as a grid of N by the parent.
 */
export default function ListingSkeleton() {
  return (
    <div className="listing-card listing-skeleton" aria-hidden="true">
      <div className="listing-media">
        <div className="skeleton-block skeleton-media" />
      </div>
      <div className="listing-body">
        <div className="skeleton-block skeleton-line skeleton-price" />
        <div className="skeleton-block skeleton-line skeleton-title" />
        <div className="skeleton-block skeleton-line skeleton-meta" />
      </div>
    </div>
  );
}
