import PhotoPreview from "./PhotoPreview.jsx";
import PhotoUploader from "./PhotoUploader.jsx";

const PHOTO_REQUIREMENTS = [
  "At least 1 photo",
  "Clear product",
  "Good lighting",
  "Visible product",
];

const PHOTO_TIPS = [
  "Use clear photos",
  "Multiple angles",
  "Show defects",
  "Good lighting",
];

/**
 * AddPhotosSection: two-column wireframe — upload area left with
 * Requirements + Tips beneath it, large preview panel right.
 * Upload state and API calls live in the page; photos are added
 * only via the dropzone / Choose Files control.
 */
export default function AddPhotosSection({
  draftReady,
  imageCount,
  hasPhoto,
  busy,
  previewProps,
  onFiles,
  onGoDetails,
}) {
  return (
    <div className="sell-photos-section">
      <div className="sell-photos-columns">
        <div className="sell-photos-left">
          <h2 className="ce-h2">Add Photos</h2>
          {!draftReady && (
            <p className="ce-hint">
              Photos attach to a saved draft.{" "}
              <button type="button" className="sell-inline-link" onClick={onGoDetails}>
                Add your details first
              </button>
              , then return here to upload — or save a draft from the Preview step.
            </p>
          )}
          <PhotoUploader
            disabled={busy}
            busy={busy}
            imageCount={imageCount}
            onFiles={onFiles}
          />
        </div>
        <div className="sell-photos-right">
          <h2 className="ce-h2">Photo Preview</h2>
          <PhotoPreview {...previewProps} busy={busy} />
        </div>
        <div className="sell-info-duo">
          <div className="sell-info-card">
            <h3>Requirements</h3>
            <ul>
              {PHOTO_REQUIREMENTS.map((item, index) => {
                const ok = index === 0 ? hasPhoto : true;
                return (
                  <li key={item} className={ok ? "is-ok" : "is-pending"}>
                    <span className="sell-req-check" aria-hidden="true">
                      {ok ? "✓" : "○"}
                    </span>
                    <span>{item}</span>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="sell-info-card">
            <h3>Tips</h3>
            <ul>
              {PHOTO_TIPS.map((item) => (
                <li key={item}>
                  <span className="sell-req-check" aria-hidden="true">✓</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
