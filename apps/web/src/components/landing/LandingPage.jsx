import LandingHero from "./LandingHero.jsx";

/**
 * Phase 1 landing page: split BUY/SELL hero filling the viewport.
 * Full-viewport page with NO top header/navigation and NO feature
 * strip or footer — hero content only.
 * No auth, catalog, cart, or backend coupling — pure presentational
 * foundation with navigation-ready links for Phase 2+.
 */
export default function LandingPage() {
  return (
    <div className="lp-page">
      <a href="#landing-main" className="visually-hidden">
        Skip to content
      </a>
      <main id="landing-main">
        <h1 className="visually-hidden">Marketplace — buy and sell</h1>
        <LandingHero />
      </main>
    </div>
  );
}
