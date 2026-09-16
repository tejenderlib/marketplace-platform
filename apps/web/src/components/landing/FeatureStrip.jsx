function Icon({ d }) {
  return (
    <span className="lp-feature-icon" aria-hidden="true">
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <path d={d} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

const FEATURES = [
  {
    title: "Trusted Platform",
    text: "Safe and secure for everyone",
    d: "M14 3l8 3v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z",
  },
  {
    title: "Wide Selection",
    text: "Discover products across categories",
    d: "M4 4h7v7H4zM17 4h7v7h-7zM4 17h7v7H4zM17 17h7v7h-7z",
  },
  {
    title: "Real People",
    text: "Buy and sell with confidence",
    d: "M14 13a4 4 0 100-8 4 4 0 000 8zM5 24c0-4 4-6.5 9-6.5s9 2.5 9 6.5",
  },
  {
    title: "Simple & Fast",
    text: "Get started in minutes",
    d: "M4 14l6-6 4 4 10-10M18 4h6v6",
  },
];

export function FeatureItem({ title, text, d }) {
  return (
    <li className="lp-feature">
      <Icon d={d} />
      <h2>{title}</h2>
      <p>{text}</p>
    </li>
  );
}

export default function FeatureStrip() {
  return (
    <section className="lp-features" id="landing-features" aria-label="Why this marketplace">
      <ul className="lp-features-grid">
        {FEATURES.map((f) => (
          <FeatureItem key={f.title} {...f} />
        ))}
      </ul>
    </section>
  );
}
