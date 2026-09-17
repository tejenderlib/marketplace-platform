import { useRef, useState } from "react";

import { IMAGE_TYPES } from "./shared.js";
import Button from "../ui/Button.jsx";

const ACCEPT = IMAGE_TYPES.join(",");

/**
 * PhotoDropzone: mouse/touch upload surface + keyboard-operable picker.
 * The drop area itself is presentational (aria-hidden) so screen readers
 * and keyboard users get exactly one control: the Browse button.
 * Validation lives in the page (Sell.jsx checkFile) — this only emits chosen Files.
 */
export default function PhotoDropzone({ disabled, hintId, onFiles }) {
  const inputRef = useRef(null);
  const dragCount = useRef(0);
  const [dragging, setDragging] = useState(false);

  function openPicker() {
    if (!disabled) inputRef.current?.click();
  }

  function emit(fileList) {
    const files = Array.from(fileList ?? []).filter((item) => item instanceof File);
    if (files.length > 0) onFiles(files);
  }

  return (
    <div>
      <div
        className={dragging ? "sell-dropzone is-dragover" : "sell-dropzone"}
        aria-hidden="true"
        onClick={openPicker}
        onDragEnter={(event) => {
          event.preventDefault();
          if (disabled) return;
          dragCount.current += 1;
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          event.preventDefault();
          dragCount.current = Math.max(0, dragCount.current - 1);
          if (dragCount.current === 0) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          dragCount.current = 0;
          setDragging(false);
          if (!disabled) emit(event.dataTransfer?.files);
        }}
      >
        <svg className="sell-dropzone-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M7 18a4.5 4.5 0 1 1 .6-8.96A5.5 5.5 0 0 1 18.3 10.5 3.75 3.75 0 0 1 17.5 18H7z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="M12 12v6m0-6-2.25 2.25M12 12l2.25 2.25"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <p className="sell-dropzone-title">Drag &amp; Drop Photo</p>
        <p className="ce-small ce-muted">or</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="sell-file-input"
        tabIndex={-1}
        aria-hidden="true"
        disabled={disabled}
        onChange={(event) => {
          emit(event.target.files);
          event.target.value = "";
        }}
      />
      <div className="sell-dropzone-actions">
        <Button variant="secondary" size="sm" disabled={disabled} onClick={openPicker} aria-describedby={hintId}>
          Choose Files
        </Button>
      </div>
    </div>
  );
}
