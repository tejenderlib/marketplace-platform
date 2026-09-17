import Button from "../ui/Button.jsx";
import { coverImage, orderedImages } from "./shared.js";
import { useAuthedImageUrl } from "./PhotoThumb.jsx";

/**
 * PhotoPreviewCard: prominent cover/selected-image preview for the sell
 * sidebar. Prev/next + dots when several images exist; glyph empty state
 * before anything is uploaded.
 */
export default function PhotoPreviewCard({ listingId, images, selectedId, onSelect }) {
  const ordered = orderedImages(images);
  const coverId = coverImage(images)?.id ?? null;
  const index = Math.max(
    0,
    ordered.findIndex((img) => img.id === (selectedId ?? coverId)),
  );
  const current = ordered[index] ?? null;
  const isCover = current != null && current.id === coverId;
  const { url, broken } = useAuthedImageUrl(listingId, current?.id);

  function step(direction) {
    if (ordered.length < 2 || !onSelect) return;
    const next = (index + direction + ordered.length) % ordered.length;
    onSelect(ordered[next].id);
  }

  return (
    <section aria-label="Photo preview">
      <div className="sell-preview-well">
        {current && url && !broken ? (
          <img
            src={url}
            alt={current.alt_text || `Cover photo preview (${index + 1} of ${ordered.length})`}
            className="sell-preview-img"
          />
        ) : (
          <>
            <span className="sell-preview-glyph" aria-hidden="true">
              <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
                <rect x="10" y="17" width="28" height="19" rx="2" stroke="currentColor" strokeWidth="1.5" />
                <path d="M18 17c0-5 2-8 6-8s6 3 6 8" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="32" cy="27" r="1.4" fill="currentColor" opacity="0.55" />
              </svg>
            </span>
            <span className="sell-preview-empty-title" aria-hidden="true">
              No photo selected
            </span>
          </>
        )}
        {ordered.length > 1 && (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="sell-preview-prev"
              onClick={() => step(-1)}
              aria-label="Previous photo"
            >
              ‹
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="sell-preview-next"
              onClick={() => step(1)}
              aria-label="Next photo"
            >
              ›
            </Button>
          </>
        )}
      </div>
      {ordered.length > 1 && (
        <div className="sell-preview-dots" role="group" aria-label="Choose preview photo">
          {ordered.map((img, i) => (
            <button
              key={img.id}
              type="button"
              aria-pressed={i === index}
              aria-label={`Preview photo ${i + 1}`}
              className={i === index ? "sell-dot is-active" : "sell-dot"}
              onClick={() => onSelect?.(img.id)}
            />
          ))}
        </div>
      )}
      {current ? (
        <p className="ce-small">
          <strong>{isCover ? "Cover photo" : "Preview"}</strong>
          <span className="ce-muted">
            {isCover
              ? " — the main image shown in search results."
              : " — previewing this photo."}
          </span>
        </p>
      ) : (
        <p className="ce-small ce-muted">Your selected product photo will appear here.</p>
      )}
    </section>
  );
}
