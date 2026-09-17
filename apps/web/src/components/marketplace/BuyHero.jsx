/**
 * BuyHero: premium marketplace banner for the public /buy surface.
 * Strict monochrome (black / white / gray) — no accent colors.
 * The CTA scrolls to the live listings grid; no fake destinations.
 */

export default function BuyHero() {
  return (
    <section className="buy-hero" aria-labelledby="buy-hero-heading">
      <div className="buy-hero-inner">
        <div className="buy-hero-copy">
          <p className="buy-hero-eyebrow">The Marketplace</p>
          <h1 id="buy-hero-heading" className="buy-hero-title">
            Find Everything You Need
          </h1>
          <p className="buy-hero-sub">Buy. Sell. Upgrade.</p>
          <a className="buy-hero-cta" href="#listings">
            Shop Now <span aria-hidden="true">→</span>
          </a>
        </div>
        <div className="buy-hero-art" aria-hidden="true">
          <svg viewBox="0 0 320 240" role="presentation">
            <rect x="24" y="24" width="272" height="192" rx="4" fill="none" stroke="#3a3a3a" />
            <circle cx="110" cy="120" r="46" fill="none" stroke="#f7f7f5" strokeWidth="2" />
            <path d="M110 96v24l16 10" fill="none" stroke="#f7f7f5" strokeWidth="2.5" strokeLinecap="round" />
            <rect x="182" y="88" width="88" height="58" rx="4" fill="none" stroke="#f7f7f5" strokeWidth="2" />
            <circle cx="226" cy="117" r="14" fill="none" stroke="#b5b5b0" strokeWidth="1.5" />
            <path d="M52 188l64-44 40 24 66-52 46 32" fill="none" stroke="#6e6e6a" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    </section>
  );
}
