import { useEffect, useRef, useState } from "react";

import { IMAGE_TYPES, MAX_IMAGE_BYTES, MAX_PHOTOS, orderedImages } from "./shared.js";
import PhotoDropzone from "./PhotoDropzone.jsx";
import PhotoThumb from "./PhotoThumb.jsx";
import Button from "../ui/Button.jsx";
import { EmptyState } from "../ui/States.jsx";

const ACCEPT_HINT = IMAGE_TYPES.map((type) => type.split("/")[1].toUpperCase()).join(", ");
const MAX_MB = Math.round(MAX_IMAGE_BYTES / 1024 / 1024);
const MAX_MB_LABEL = `${MAX_MB}MB`;

/**
 * Images step: drag-drop/file-picker upload against the byte-upload API,
 * thumbnail grid with cover badge, preview selection, reorder + remove.
 * Props-compatible with the previous render; adds optional
 * selectedId/onSelect for the preview card. Client pre-checks mirror the
 * server policy (server stays authoritative).
 */
export default function ImagesStep({
  draftId,
  images,
  busy,
  selectedId,
  onSelect,
  onEnsureDraft,
  onUpload,
  onUpdate,
  onDelete,
}) {
  const [altText, setAltText] = useState("");
  const [localError, setLocalError] = useState(null);
  const [pending, setPending] = useState([]);
  const pendingUrls = useRef([]);

  const ordered = orderedImages(images);
  const coverId = ordered.find((img) => img.is_primary)?.id ?? ordered[0]?.id ?? null;
  const selected = selectedId ?? coverId;

  // Revoke any leftover local preview URLs on unmount (per-file revoke
  // after each upload handles the normal path).
  useEffect(
    () => () => {
      pendingUrls.current.forEach((url) => URL.revokeObjectURL(url));
      pendingUrls.current = [];
    },
    [],
  );

  function checkFile(file) {
    if (file.type && !IMAGE_TYPES.includes(file.type)) {
      return `“${file.name}” is not supported. Allowed: ${ACCEPT_HINT}.`;
    }
    if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
      return `“${file.name}” must be smaller than ${MAX_MB_LABEL}.`;
    }
    return null;
  }

  async function handleFiles(files) {
    setLocalError(null);
    const list = Array.from(files ?? []);
    if (list.length === 0) return;
    const room = MAX_PHOTOS - ordered.length - pending.length;
    if (room <= 0) {
      setLocalError(`Maximum ${MAX_PHOTOS} photos per listing. Remove one to add another.`);
      return;
    }
    const accepted = list.slice(0, room);
    const skipped = [];
    if (list.length > room) {
      setLocalError(`Only ${room} more photo${room === 1 ? "" : "s"} fit (maximum ${MAX_PHOTOS}).`);
    }
    for (const file of accepted) {
      const problem = checkFile(file);
      if (problem) {
        setLocalError(problem);
        continue;
      }
      const url = URL.createObjectURL(file);
      pendingUrls.current.push(url);
      const key = `${url}`;
      setPending((prev) => [...prev, { key, url, name: file.name }]);
      // Shared alt text applies to every file in one batch.
      const ok = await onUpload(file, altText.trim() ? altText.trim() : null);
      setPending((prev) => prev.filter((item) => item.key !== key));
      pendingUrls.current = pendingUrls.current.filter((item) => item !== url);
      URL.revokeObjectURL(url);
      if (!ok) {
        skipped.push(file.name);
      }
    }
    if (skipped.length > 0) {
      setLocalError(
        `${skipped.length} photo${skipped.length === 1 ? "" : "s"} could not be uploaded (${skipped.join(", ")}). Check the notice above and retry.`,
      );
    } else {
      setAltText("");
    }
  }

  const maxOrder = ordered.reduce((max, img) => Math.max(max, img.sort_order ?? 0), 0);

  async function move(image, direction) {
    const index = ordered.findIndex((img) => img.id === image.id);
    const other = ordered[index + direction];
    if (!other) return;
    // Occupied orders are rejected server-side, so swap via a free slot.
    const free = maxOrder + 1;
    const ok = await onUpdate(image.id, { sort_order: free });
    if (!ok) return;
    const ok2 = await onUpdate(other.id, { sort_order: image.sort_order ?? 0 });
    if (!ok2) {
      await onUpdate(image.id, { sort_order: image.sort_order ?? 0 });
      return;
    }
    await onUpdate(image.id, { sort_order: other.sort_order ?? 0 });
  }

  if (!draftId) {
    return (
      <div className="ce-form">
        <EmptyState
          title="Save your draft first"
          hint="Images attach to a saved draft."
          action={
            <Button variant="primary" disabled={busy} onClick={onEnsureDraft}>
              {busy ? "Saving…" : "Save Draft"}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="sell-photos">
      <PhotoDropzone disabled={busy} hintId="sell-photo-hint" onFiles={handleFiles} />
      <p className="ce-small ce-muted" id="sell-photo-hint">
        You can add up to {MAX_PHOTOS} photos. {ACCEPT_HINT}. Max {MAX_MB_LABEL} per photo.
      </p>

      <label className="ce-field">
        <span>Alt text for new photos (optional)</span>
        <input
          type="text"
          value={altText}
          maxLength={255}
          disabled={busy}
          onChange={(event) => setAltText(event.target.value)}
          placeholder="Describe the photo for screen readers"
        />
      </label>

      {localError && (
        <p className="ce-error" role="alert">
          {localError}
        </p>
      )}

      {ordered.length === 0 && pending.length === 0 ? (
        <div className="sell-photos-empty" role="status">
          <p className="ce-small ce-muted">
            No photos yet. Listings with clear photos sell faster — add your first photo above.
          </p>
        </div>
      ) : (
        <ul className="sell-thumbs" aria-label="Uploaded photos">
          {ordered.map((image, index) => (
            <PhotoThumb
              key={image.id}
              listingId={draftId}
              image={image}
              index={index}
              isCover={image.id === coverId}
              selected={selected === image.id}
              busy={busy}
              onSelect={() => onSelect?.(image.id)}
              onSetCover={() => onUpdate(image.id, { is_primary: true })}
              onRemove={() => onDelete(image.id)}
              onMove={(direction) => move(image, direction)}
              canMovePrev={index > 0}
              canMoveNext={index < ordered.length - 1}
            />
          ))}
          {pending.map((item) => (
            <li key={item.key} className="sell-thumb is-uploading" aria-label={`Uploading ${item.name}`}>
              <span className="sell-thumb-main">
                <img src={item.url} alt={`Uploading ${item.name}`} className="sell-thumb-img" />
                <span className="ce-pill sell-thumb-cover">Uploading…</span>
              </span>
            </li>
          ))}
          {ordered.length + pending.length < MAX_PHOTOS && (
            <li className="sell-thumb sell-add" aria-hidden="true">
              <span className="sell-add-tile">+</span>
            </li>
          )}
        </ul>
      )}

      <div className="sell-tips">
        <h3 className="ce-h3">Tips for great photos</h3>
        <ul className="ce-small ce-muted">
          <li>Use good lighting and avoid dark or blurry photos.</li>
          <li>Show the item from multiple angles.</li>
          <li>Include close-ups of important details.</li>
          <li>Avoid stock photos or images from the internet.</li>
        </ul>
      </div>
    </div>
  );
}
