import { ROUTES } from "../../config/routes.js";

/**
 * Monochrome editorial visuals. Pure inline SVG — no network requests,
 * no dependencies, grayscale only so the palette stays strictly
 * white / black / gray.
 */

export function BuyerVisual() {
  return (
    <figure className="lp-visual" aria-label="Curated premium products for buyers">
      <svg viewBox="0 0 400 220" role="img" aria-labelledby="lp-buy-title lp-buy-desc">
        <title id="lp-buy-title">Premium marketplace products</title>
        <desc id="lp-buy-desc">Minimal line illustration of a watch, camera and bag in gray tones</desc>
        <rect x="8" y="8" width="384" height="204" rx="4" fill="none" stroke="#d4d4d0" />
        {/* watch */}
        <circle cx="110" cy="110" r="52" fill="#fff" stroke="#0a0a0a" strokeWidth="2" />
        <circle cx="110" cy="110" r="40" fill="none" stroke="#6e6e6a" strokeWidth="1.5" />
        <path d="M110 82v28l18 12" fill="none" stroke="#0a0a0a" strokeWidth="2.5" strokeLinecap="round" />
        <rect x="96" y="44" width="28" height="16" fill="#e4e4e1" stroke="#0a0a0a" />
        <rect x="96" y="160" width="28" height="16" fill="#e4e4e1" stroke="#0a0a0a" />
        {/* camera */}
        <rect x="190" y="80" width="110" height="64" rx="4" fill="#f0f0ee" stroke="#0a0a0a" strokeWidth="2" />
        <circle cx="245" cy="112" r="20" fill="#fff" stroke="#0a0a0a" strokeWidth="2" />
        <circle cx="245" cy="112" r="9" fill="#2b2b28" />
        <rect x="222" y="70" width="34" height="12" fill="#e4e4e1" stroke="#0a0a0a" />
        {/* bag */}
        <path d="M320 100h44l6 52h-56z" fill="#fff" stroke="#0a0a0a" strokeWidth="2" />
        <path d="M330 100c0-12 4-20 12-20s12 8 12 20" fill="none" stroke="#0a0a0a" strokeWidth="2" />
      </svg>
      <figcaption>Curated selection</figcaption>
    </figure>
  );
}

export function SellerVisual() {
  return (
    <figure className="lp-visual" aria-label="Seller growth illustration">
      <svg viewBox="0 0 400 220" role="img" aria-labelledby="lp-sell-title lp-sell-desc">
        <title id="lp-sell-title">Selling made simple</title>
        <desc id="lp-sell-desc">Minimal rising chart with product boxes in gray tones</desc>
        <rect x="8" y="8" width="384" height="204" rx="4" fill="none" stroke="#2a2a2a" />
        <path d="M40 170 120 120l50 30 90-70 60 40" fill="none" stroke="#f7f7f5" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="260" cy="80" r="5" fill="#f7f7f5" />
        <rect x="52" y="130" width="44" height="44" fill="none" stroke="#b5b5b0" strokeWidth="1.5" />
        <rect x="104" y="146" width="44" height="28" fill="none" stroke="#b5b5b0" strokeWidth="1.5" />
        <rect x="300" y="120" width="52" height="52" fill="none" stroke="#f7f7f5" strokeWidth="2" />
        <path d="M300 132h52M326 120v52" stroke="#6e6e6a" strokeWidth="1.5" />
      </svg>
      <figcaption>Reach more buyers</figcaption>
    </figure>
  );
}

export function BuyerPanel() {
  return (
    <section className="lp-panel lp-panel--buy" aria-labelledby="lp-buy-heading">
      <div className="lp-panel-inner">
        <p className="lp-eyebrow">For Buyers</p>
        <h2 id="lp-buy-heading" className="lp-title">
          Find What You Love
        </h2>
        <p className="lp-sub">Discover products, great deals and trusted sellers — all in one place.</p>
        <a className="lp-panel-cta" href={ROUTES.buy}>
          Start Buying <span className="lp-arrow" aria-hidden="true">→</span>
        </a>
        <BuyerVisual />
      </div>
    </section>
  );
}

export function SellerPanel() {
  return (
    <section className="lp-panel lp-panel--sell" aria-labelledby="lp-sell-heading">
      <div className="lp-panel-inner">
        <p className="lp-eyebrow">For Sellers</p>
        <h2 id="lp-sell-heading" className="lp-title">
          Turn Your Items Into Opportunity
        </h2>
        <p className="lp-sub">List your products, reach more buyers and grow your sales with ease.</p>
        <a className="lp-panel-cta" href={ROUTES.sell}>
          Start Selling <span className="lp-arrow" aria-hidden="true">→</span>
        </a>
        <SellerVisual />
      </div>
    </section>
  );
}
