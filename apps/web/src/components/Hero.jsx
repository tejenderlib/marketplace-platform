export default function Hero({ query, onQueryChange }) {
  return (
    <section className="hero">
      <div className="hero-inner">
        <p className="eyebrow">Buy and sell anything</p>
        <h1>Find a deal, or sell yours today</h1>
        <p className="hero-sub">
          Shop fixed-price listings from local sellers, or bid live in auctions. Posting takes less
          than a minute.
        </p>
        <form
          className="hero-search"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            document.getElementById("listings")?.scrollIntoView({ behavior: "smooth" });
          }}
        >
          <input
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Try &quot;bike&quot;, &quot;iPhone&quot;, or &quot;laptop&quot;…"
            aria-label="Search the marketplace"
          />
          <button type="submit" className="btn btn-primary">
            Search
          </button>
        </form>
      </div>
    </section>
  );
}
