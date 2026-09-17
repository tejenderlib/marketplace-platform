/**
 * ProductMedia: 4:3 media well. Renders the real uploaded image via the
 * listing-image content endpoint when the listing has image metadata;
 * otherwise a restrained monochrome glyph placeholder — never a fake
 * photo and never a giant initial. Photo count comes from imageCount.
 *
 * Public listings serve openly. Private listings (e.g. the seller's own
 * draft preview) need `authed`, which fetches the bytes with the
 * session Bearer token; without it a private image falls back to the
 * placeholder instead of leaking existence through a broken icon.
 */

import { useEffect, useState } from "react";

import { imageContentUrl } from "../../api/catalog.js";
import { getToken } from "../../auth/auth.js";

function Glyph({ size }) {
  return (
    <div className={size === "lg" ? "ce-media ce-media--lg" : "ce-media"} aria-hidden="true">
      <svg className="ce-media-glyph" viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <rect x="10" y="17" width="28" height="19" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M18 17c0-5 2-8 6-8s6 3 6 8" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10 23.5h28" stroke="currentColor" strokeWidth="1" opacity="0.45" />
        <circle cx="32" cy="27" r="1.4" fill="currentColor" opacity="0.55" />
      </svg>
    </div>
  );
}

export default function ProductMedia({ listing, size, authed }) {
  const primary =
    listing.primaryImage ??
    (Array.isArray(listing.images) ? listing.images[0] : null) ??
    null;
  const remoteUrl =
    primary && listing.id && primary.id
      ? imageContentUrl(listing.id, primary.id)
      : null;
  const [objectUrl, setObjectUrl] = useState(null);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setObjectUrl(null);
    setBroken(false);
  }, [remoteUrl]);

  useEffect(() => {
    if (!authed || !remoteUrl || broken) return undefined;
    let alive = true;
    let url = null;
    const token = getToken();
    if (!token) {
      setBroken(true);
      return undefined;
    }
    fetch(remoteUrl, { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.blob();
      })
      .then((blob) => {
        if (alive) {
          url = URL.createObjectURL(blob);
          setObjectUrl(url);
        }
      })
      .catch(() => {
        if (alive) setBroken(true);
      });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [authed, remoteUrl, broken]);

  if (!primary || !remoteUrl || broken) {
    return <Glyph size={size} />;
  }
  return (
    <div className={size === "lg" ? "ce-media ce-media--lg" : "ce-media"}>
      <img
        className="ce-media-img"
        src={objectUrl ?? remoteUrl}
        alt={primary.alt_text || listing.title}
        loading="lazy"
        onError={() => setBroken(true)}
      />
    </div>
  );
}
