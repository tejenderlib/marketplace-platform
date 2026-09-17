import PhotoThumb from "./PhotoThumb.jsx";

/**
 * PhotoGallery: uploaded thumbnail grid with numbered badges, cover state,
 * reorder and remove actions. Remote bytes load via the existing authed
 * hook inside PhotoThumb; uploading placeholders render local previews.
 */
export default function PhotoGallery({
  listingId,
  images,
  pending,
  selectedId,
  busy,
  onSelect,
  onSetCover,
  onRemove,
  onMove,
}) {
  const ordered = [...(images ?? [])].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.id).localeCompare(String(b.id)),
  );
  const pendingList = pending ?? [];
  const coverId = ordered.find((img) => img.is_primary)?.id ?? ordered[0]?.id ?? null;
  const selected = selectedId ?? coverId;

  // No placeholders: the right-side column stays reserved (empty) until
  // photos exist; uploaded thumbnails render here without changing
  // the dropzone size or position.
  if (ordered.length === 0 && pendingList.length === 0) {
    return null;
  }

  return (
    <ul className="sell-thumbs sell-thumbs--slots" aria-label="Uploaded photos">
      {ordered.map((image, index) => (
        <PhotoThumb
          key={image.id}
          listingId={listingId}
          image={image}
          index={index}
          isCover={image.id === coverId}
          selected={selected === image.id}
          busy={busy}
          onSelect={() => onSelect?.(image.id)}
          onSetCover={() => onSetCover?.(image.id)}
          onRemove={() => onRemove?.(image.id)}
          onMove={(direction) => onMove?.(image, direction)}
          canMovePrev={index > 0}
          canMoveNext={index < ordered.length - 1}
        />
      ))}
      {pendingList.map((item) => (
        <li key={item.key} className="sell-thumb is-uploading" aria-label={`Uploading ${item.name}`}>
          <span className="sell-thumb-main">
            <img src={item.url} alt={`Uploading ${item.name}`} className="sell-thumb-img" />
            <span className="ce-pill sell-thumb-cover">Uploading…</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
