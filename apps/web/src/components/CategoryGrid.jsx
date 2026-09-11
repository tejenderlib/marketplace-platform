export default function CategoryGrid({ categories, active, onSelect, loading }) {
  return (
    <section className="section" aria-labelledby="categories-heading">
      <div className="section-head">
        <h2 id="categories-heading">Browse categories</h2>
      </div>
      {loading ? (
        <p className="muted">Loading categories…</p>
      ) : (
        <ul className="category-grid">
          <li>
            <button
              type="button"
              className={active === "All" ? "category-card is-active" : "category-card"}
              onClick={() => onSelect("All")}
              aria-pressed={active === "All"}
            >
              <span className="category-icon" aria-hidden="true">
                🧭
              </span>
              <span className="category-name">All</span>
            </button>
          </li>
          {categories.map((cat) => (
            <li key={cat.id}>
              <button
                type="button"
                className={active === cat.id ? "category-card is-active" : "category-card"}
                onClick={() => onSelect(cat.id)}
                aria-pressed={active === cat.id}
              >
                <span className="category-icon" aria-hidden="true">
                  {cat.name.charAt(0).toUpperCase()}
                </span>
                <span className="category-name">{cat.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
