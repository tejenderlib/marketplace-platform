/**
 * ProductMedia: 4:3 media well. Images are storage_key references only
 * (no servable URLs in V1), so the well shows a restrained serif initial
 * placeholder — never a fake photo. Photo count comes from imageCount.
 */

export default function ProductMedia({ listing, size }) {
  const initial = (listing.title?.charAt(0) ?? "?").toUpperCase();
  return (
    <div className={size === "lg" ? "ce-media ce-media--lg" : "ce-media"} aria-hidden="true">
      <span className="ce-media-mark">{initial}</span>
    </div>
  );
}
