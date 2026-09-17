import { useEffect, useRef, useState } from "react";

/**
 * Authenticated account trigger (avatar initial + name + caret) with a
 * dropdown of the EXISTING account routes. Closes on outside click,
 * Escape (returning focus to the trigger), or hash navigation.
 * Guest rendering (Log In) stays in Header; this menu is auth-only.
 */
export default function AccountMenu({ user, displayName, favoriteCount, onOrders, onLogout }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);

  const initial = (displayName ?? "?").trim().charAt(0).toUpperCase() || "?";

  useEffect(() => {
    if (!open) return undefined;
    function onDocClick(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    }
    function onKey(event) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    function onHashChange() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener("hashchange", onHashChange);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("hashchange", onHashChange);
    };
  }, [open]);

  function close() {
    setOpen(false);
  }

  function handleOrders() {
    close();
    onOrders();
  }

  async function handleLogout() {
    close();
    await onLogout();
  }

  return (
    <div className="account-menu" ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        className={open ? "account-trigger is-open" : "account-trigger"}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={open ? "Close account menu" : `Account menu for ${displayName}`}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="account-avatar" aria-hidden="true">
          {initial}
        </span>
        <span className="account-name">{displayName}</span>
        <span className={open ? "account-caret is-open" : "account-caret"} aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div className="account-panel" role="menu" aria-label="Account" onClick={close}>
          <a className="account-item" role="menuitem" href="#/account" title={user?.email ?? ""}>
            Profile
          </a>
          <a className="account-item" role="menuitem" href="#/profile/favorites">
            Favorites
            {favoriteCount > 0 && (
              <span className="account-count" aria-label={`${favoriteCount} saved`}>
                {favoriteCount > 99 ? "99+" : favoriteCount}
              </span>
            )}
          </a>
          <a className="account-item" role="menuitem" href="#/profile/offers">
            My Offers
          </a>
          <a className="account-item" role="menuitem" href="#/seller/offers">
            Seller Offers
          </a>
          <a className="account-item" role="menuitem" href="#/profile/messages">
            Messages
          </a>
          <a className="account-item" role="menuitem" href="#/profile/notifications">
            Notifications
          </a>
          <button type="button" className="account-item" role="menuitem" onClick={handleOrders}>
            My Orders
          </button>
          <a className="account-item" role="menuitem" href="#/profile/settings">
            Settings
          </a>
          <div className="account-sep" aria-hidden="true" />
          <button
            type="button"
            className="account-item is-danger"
            role="menuitem"
            onClick={handleLogout}
          >
            Log Out
          </button>
        </div>
      )}
    </div>
  );
}
