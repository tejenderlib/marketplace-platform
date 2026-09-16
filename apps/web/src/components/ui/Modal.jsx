/**
 * CE Modal shell: overlay + dialog with focus-trap, autofocus, Escape,
 * and focus-return. Port of the hand-rolled trap in OfferModal (behavior
 * preserved, including the `dismissable` guard for busy submits).
 */

import { useEffect, useRef } from "react";

export default function Modal({
  label,
  onClose,
  dismissable = true,
  initialFocusRef,
  children,
}) {
  const dialogRef = useRef(null);
  const fallbackFocusRef = useRef(null);
  const previousFocusRef = useRef(null);

  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    const target = initialFocusRef?.current ?? fallbackFocusRef.current;
    target?.focus();
    return () => {
      previousFocusRef.current?.focus?.();
    };
  }, [initialFocusRef]);

  useEffect(() => {
    function onKey(event) {
      if (event.key === "Escape" && dismissable) onClose?.();
      if (event.key === "Tab" && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href]',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dismissable, onClose]);

  return (
    <div
      className="ce-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onMouseDown={(event) => {
        if (dismissable && event.target === event.currentTarget) onClose?.();
      }}
    >
      <div className="ce-modal" ref={dialogRef}>
        <span ref={fallbackFocusRef} tabIndex={-1} aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}
