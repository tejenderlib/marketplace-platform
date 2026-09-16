import { useState } from "react";

import { IMAGE_TYPES, MAX_IMAGE_BYTES } from "./shared.js";
import Button from "../ui/Button.jsx";
import { EmptyState, Notice } from "../ui/States.jsx";

const EMPTY_REF = {
  storage_key: "",
  content_type: "image/jpeg",
  byte_size: "",
  width: "",
  height: "",
  alt_text: "",
};

/**
 * Step 3: image REFERENCE management against the real metadata-only API.
 * V1 accepts no file bytes, so this UI registers storage references
 * honestly (and says so) instead of faking an upload. Logic unchanged.
 */
export default function ImagesStep({ draftId, images, busy, onEnsureDraft, onAdd, onUpdate, onDelete }) {
  const [ref, setRef] = useState(EMPTY_REF);
  const [localError, setLocalError] = useState(null);

  function set(key, value) {
    setRef((prev) => ({ ...prev, [key]: value }));
  }

  async function handleAdd(event) {
    event.preventDefault();
    setLocalError(null);
    if (!ref.storage_key.trim()) {
      setLocalError("Enter the storage key or reference for this image.");
      return;
    }
    const bytes = Number(ref.byte_size);
    if (!Number.isFinite(bytes) || bytes <= 0 || bytes > MAX_IMAGE_BYTES) {
      setLocalError("Byte size must be between 1 and 10485760 (10 MiB).");
      return;
    }
    const body = {
      storage_key: ref.storage_key.trim(),
      content_type: ref.content_type,
      byte_size: Math.round(bytes),
      width: ref.width === "" ? null : Math.max(1, Math.round(Number(ref.width) || 0)) || null,
      height: ref.height === "" ? null : Math.max(1, Math.round(Number(ref.height) || 0)) || null,
      alt_text: ref.alt_text.trim() ? ref.alt_text.trim() : null,
      is_primary: images.length === 0,
    };
    const ok = await onAdd(body);
    if (ok) setRef(EMPTY_REF);
  }

  if (!draftId) {
    return (
      <div className="ce-form">
        <EmptyState
          title="Save your draft first"
          hint="Image references attach to a saved draft."
          action={
            <Button variant="primary" disabled={busy} onClick={onEnsureDraft}>
              {busy ? "Saving…" : "Save Draft"}
            </Button>
          }
        />
      </div>
    );
  }

  const maxOrder = images.reduce((max, img) => Math.max(max, img.sort_order ?? 0), 0);

  async function move(image, direction) {
    const ordered = [...images].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
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

  return (
    <div className="ce-form">
      <Notice tone="warning">
        Reference images already stored under your object-store key. File upload is not part of
        the V1 API — nothing here uploads bytes.
      </Notice>

      {images.length === 0 ? (
        <p className="ce-small ce-muted">No images yet. Listings with photos sell faster.</p>
      ) : (
        <ul className="ce-image-list">
          {[...images]
            .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
            .map((image, index, ordered) => (
              <li key={image.id} className="ce-image-item">
                <div>
                  <p className="ce-image-key">{image.storage_key}</p>
                  <p className="ce-small ce-muted">
                    {image.content_type} · {Number(image.byte_size).toLocaleString("en-IN")} bytes
                    {image.alt_text ? ` · “${image.alt_text}”` : ""}
                  </p>
                </div>
                <span>
                  {image.is_primary ? (
                    <span className="ce-pill ce-pill--success">Primary</span>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => onUpdate(image.id, { is_primary: true })}
                    >
                      Set primary
                    </Button>
                  )}
                </span>
                <div className="ce-image-actions">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy || index === 0}
                    onClick={() => move(image, -1)}
                    aria-label={`Move ${image.storage_key} earlier`}
                  >
                    ↑
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy || index === ordered.length - 1}
                    onClick={() => move(image, 1)}
                    aria-label={`Move ${image.storage_key} later`}
                  >
                    ↓
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={busy}
                    onClick={() => onDelete(image.id)}
                  >
                    Remove
                  </Button>
                </div>
              </li>
            ))}
        </ul>
      )}

      <form onSubmit={handleAdd} className="ce-form">
        <h3 className="ce-h3">Add image reference</h3>
        <label className="ce-field">
          <span>
            Storage key <span aria-hidden="true">*</span>
          </span>
          <input
            type="text"
            value={ref.storage_key}
            maxLength={2000}
            onChange={(event) => set("storage_key", event.target.value)}
            placeholder="e.g. listings/abc123/photo-1.jpg"
          />
        </label>
        <div className="ce-form-row">
          <label className="ce-field">
            <span>Content type</span>
            <select value={ref.content_type} onChange={(event) => set("content_type", event.target.value)}>
              {IMAGE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label className="ce-field">
            <span>
              Size (bytes) <span aria-hidden="true">*</span>
            </span>
            <input
              type="number"
              min="1"
              max={MAX_IMAGE_BYTES}
              value={ref.byte_size}
              onChange={(event) => set("byte_size", event.target.value)}
              placeholder="e.g. 245000"
            />
          </label>
        </div>
        <div className="ce-form-row">
          <label className="ce-field">
            <span>Width (px) (optional)</span>
            <input
              type="number"
              min="1"
              value={ref.width}
              onChange={(event) => set("width", event.target.value)}
            />
          </label>
          <label className="ce-field">
            <span>Height (px) (optional)</span>
            <input
              type="number"
              min="1"
              value={ref.height}
              onChange={(event) => set("height", event.target.value)}
            />
          </label>
        </div>
        <label className="ce-field">
          <span>Alt text (optional)</span>
          <input
            type="text"
            value={ref.alt_text}
            maxLength={255}
            onChange={(event) => set("alt_text", event.target.value)}
            placeholder="Describe the photo for screen readers"
          />
        </label>
        {localError && (
          <p className="ce-error" role="alert">
            {localError}
          </p>
        )}
        <div>
          <Button variant="primary" type="submit" disabled={busy}>
            {busy ? "Adding…" : "Add Reference"}
          </Button>
        </div>
      </form>
    </div>
  );
}
