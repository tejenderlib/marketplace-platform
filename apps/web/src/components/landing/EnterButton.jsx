import { ROUTES } from "../../config/routes.js";

/**
 * Center ENTER control overlapping the BUY/SELL divide.
 * Navigation-ready: points at the buy destination (Phase 3 binds it).
 */
export default function EnterButton() {
  return (
    <div className="lp-enter-wrap">
      <a className="lp-enter" href={ROUTES.buy} aria-label="Enter the marketplace">
        <span>Enter</span>
        <span className="lp-enter-mark" aria-hidden="true">↓</span>
      </a>
    </div>
  );
}
