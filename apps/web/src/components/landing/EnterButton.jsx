import { useState } from "react";

import { useAuth } from "../../auth/AuthContext.jsx";
import { setPostLoginRedirect } from "../../auth/auth.js";
import { ROUTES } from "../../config/routes.js";

/**
 * Center ENTER control overlapping the BUY/SELL divide.
 * Auth-gated: re-validates the session through /auth/me on each click so
 * token presence alone never grants entry. Only ACTIVE accounts enter.
 * Unauthenticated → Login. Authenticated → Marketplace.
 */
export default function EnterButton() {
  const { isAuthenticated, loading, authFetch } = useAuth();
  const [validating, setValidating] = useState(false);

  async function handleEnter() {
    if (loading || validating) return;
    if (!isAuthenticated) {
      setPostLoginRedirect(ROUTES.buy);
      window.location.hash = ROUTES.login;
      return;
    }
    // Re-verify server-side before granting marketplace entry. This
    // catches stale/rotated/suspended tokens left in localStorage.
    // Note: authFetch only tears down the local session on 401 with a
    // failed refresh; other failures just redirect here (UX gate only —
    // backend endpoints enforce require_active_user authoritatively).
    setValidating(true);
    try {
      const me = await authFetch("/auth/me");
      if (!me || me.status !== "ACTIVE") {
        setPostLoginRedirect(ROUTES.buy);
        window.location.hash = ROUTES.login;
        return;
      }
      window.location.hash = ROUTES.buy;
    } catch {
      setPostLoginRedirect(ROUTES.buy);
      window.location.hash = ROUTES.login;
    } finally {
      setValidating(false);
    }
  }

  return (
    <div className="lp-enter-wrap">
      <button
        type="button"
        className="lp-enter"
        onClick={handleEnter}
        aria-label="Enter the marketplace"
        disabled={loading || validating}
      >
        <span>Enter</span>
        <span className="lp-enter-mark" aria-hidden="true">↓</span>
      </button>
    </div>
  );
}
