import Button from "../ui/Button.jsx";
import PhotoPreviewCard from "./PhotoPreviewCard.jsx";
import { coverImage, orderedImages } from "./shared.js";

/**
 * PhotoPreview: large cover/selected preview with carousel controls plus
 * an explicit "Set as Cover" action for the previewed photo.
 */
export default function PhotoPreview({ listingId, images, selectedId, onSelect, onSetCover, onRemove, busy }) {
  const ordered = orderedImages(images);
  const coverId = coverImage(images)?.id ?? null;
  const currentId = selectedId ?? coverId;
  const current = ordered.find((img) => img.id === currentId) ?? null;
  const isCover = current != null && current.id === coverId;

  return (
    <div className="sell-photo-preview">
      <PhotoPreviewCard
        listingId={listingId}
        images={images}
        selectedId={selectedId}
        onSelect={onSelect}
      />
      {current && (
        <div className="sell-preview-actions">
          {!isCover && onSetCover && (
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => onSetCover(current.id)}
            >
              Set as Cover
            </Button>
          )}
          {onRemove && (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => onRemove(current.id)}
            >
              Remove
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
