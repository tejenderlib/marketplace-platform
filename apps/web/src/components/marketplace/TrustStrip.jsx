/**
 * TrustStrip: concise value strip stating only real supported platform
 * facts (moderation lifecycle, server-side pricing, INR-only, reserve
 * enforcement). No metrics, counts, ratings, or invented claims.
 */

const FACTS = [
  {
    title: "Published by sellers",
    body: "Listings go live immediately and are moderated after publication.",
  },
  {
    title: "Priced by the platform",
    body: "Checkout totals come from server-side rows — never the browser.",
  },
  {
    title: "INR-only, India-first",
    body: "Every price is stored in paise and settled in rupees.",
  },
  {
    title: "Honest auctions",
    body: "Settlement honors the reserve; below-reserve closes have no winner.",
  },
];

export default function TrustStrip() {
  return (
    <section className="ce-section ce-trust" aria-label="Why buy here">
      <dl className="ce-trust-grid">
        {FACTS.map((fact) => (
          <div key={fact.title}>
            <dt>{fact.title}</dt>
            <dd>{fact.body}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
