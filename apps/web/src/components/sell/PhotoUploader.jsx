import PhotoDropzone from "./PhotoDropzone.jsx";

/**
 * PhotoUploader: dashed drop area + Choose Files + policy hint.
 * Emits chosen Files upward; type/size validation runs in the page
 * (Sell.jsx checkFile) and the server stays authoritative.
 */
export default function PhotoUploader({ disabled, busy, imageCount, onFiles }) {
  function handleFiles(files) {
    const list = Array.from(files ?? []).filter((item) => item instanceof File);
    if (list.length === 0) return;
    onFiles(list);
  }

  return (
    <div className="sell-uploader">
      <PhotoDropzone disabled={disabled || busy} hintId="sell-upload-hint" onFiles={handleFiles} />
      <p className="ce-small ce-muted" id="sell-upload-hint">
        Upload clear photos of your product.
      </p>
      <p className="ce-small ce-muted">
        JPG, PNG or WebP • Multiple images supported
        {imageCount > 0 ? ` • ${imageCount} uploaded` : ""}
      </p>
    </div>
  );
}
