import LandingHeader from "./LandingHeader.jsx";
import LandingHero from "./LandingHero.jsx";
import FeatureStrip from "./FeatureStrip.jsx";

/**
 * Phase 1 landing page: header + split BUY/SELL hero + feature strip.
 * No auth, catalog, cart, or backend coupling — pure presentational
 * foundation with navigation-ready links for Phase 2+.
 */
export default function LandingPage() {
  return (
    <div className="lp-page">
      <a href="#landing-main" className="visually-hidden">
        Skip to content
      </a>
      <LandingHeader />
      <main id="landing-main">
        <h1 className="visually-hidden">Marketplace — buy and sell</h1>
        <LandingHero />
        <FeatureStrip />
      </main>
      <footer className="lp-foot">
        <div className="lp-foot-inner">
          <p>[BRAND NAME] — Buy and sell in one place.</p>
          <p>Phase 1 foundation</p>
        </div>
      </footer>
    </div>
  );
}
