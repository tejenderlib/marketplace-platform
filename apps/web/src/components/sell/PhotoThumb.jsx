import { useEffect, useState } from "react";

import { imageContentUrl } from "../../api/catalog.js";
import { getToken } from "../../auth/auth.js";
import Button from "../ui/Button.jsx";

/**
 * Fetch private listing-image bytes with the session token and expose an
 * object URL. Same pattern as ProductMedia (authed): the content endpoint
 * enforces visibility server-side; failures fall back to the glyph.
 */
export function useAuthedImageUrl(listingId, imageId) {
  const [url, setUrl] = useState(null);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setUrl(null);
    setBroken(false);
    if (!listingId || !imageId) return undefined;
    let alive = true;
    let objectUrl = null;
    const token = getToken();
    if (!token) {
      setBroken(true);
      return undefined;
    }
    fetch(imageContentUrl(listingId, imageId), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.blob();
      })
      .then((blob) => {
        if (alive) {
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
        }
      })
      .catch(() => {
        if (alive) setBroken(true);
      });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [listingId, imageId]);

  return { url, broken };
}

function Glyph() {
  return (
    <span className="sell-thumb-glyph" aria-hidden="true">
      <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <rect x="10" y="17" width="28" height="19" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M18 17c0-5 2-8 6-8s6 3 6 8" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="32" cy="27" r="1.4" fill="currentColor" opacity="0.55" />
      </svg>
    </span>
  );
}

/**
 * PhotoThumb: one thumbnail tile. Remote rows load via useAuthedImageUrl;
 * not-yet-uploaded files render their local object URL. No fake photos —
 * glyph only while loading/broken.
 */
export default function PhotoThumb({
  listingId,
  image,
  localUrl,
  index,
  isCover,
  selected,
  busy,
  onSelect,
  onSetCover,
  onRemove,
  onMove,
  canMovePrev,
  canMoveNext,
}) {
  const remote = useAuthedImageUrl(
    localUrl ? null : listingId,
    localUrl ? null : image?.id,
  );
  const src = localUrl ?? remote.url;
  const broken = localUrl ? false : remote.broken;
  const label = `Photo ${index + 1}${isCover ? " (cover)" : ""}`;

  return (
    <li className={selected ? "sell-thumb is-selected" : "sell-thumb"}>
      <button
        type="button"
        className="sell-thumb-main"
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={`Preview ${label}`}
      >
        <span className="sell-thumb-num" aria-hidden="true">
          {index + 1}
        </span>
        {src && !broken ? (
          <img src={src} alt={image?.alt_text || label} className="sell-thumb-img" />
        ) : (
          <Glyph />
        )}
        {isCover && <span className="ce-pill ce-pill--success sell-thumb-cover">Cover</span>}
      </button>
      <div className="sell-thumb-actions">
        {!isCover && onSetCover && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={onSetCover}>
            Set cover
          </Button>
        )}
        {onMove && (
          <>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy || !canMovePrev}
              onClick={() => onMove(-1)}
              aria-label={`Move photo ${index + 1} earlier`}
            >
              ↑
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy || !canMoveNext}
              onClick={() => onMove(1)}
              aria-label={`Move photo ${index + 1} later`}
            >
              ↓
            </Button>
          </>
        )}
        {onRemove && (
          <Button variant="danger" size="sm" disabled={busy} onClick={onRemove} aria-label={`Remove photo ${index + 1}`}>
            ✕
          </Button>
        )}
      </div>
    </li>
  );
}
