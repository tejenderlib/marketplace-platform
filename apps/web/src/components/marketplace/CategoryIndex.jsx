/**
 * CategoryIndex: homepage text-led category directory over the shared
 * buildDirectory() source. Same onSelect(id) contract as the header.
 */

import CategoryDirectory from "./CategoryDirectory.jsx";

export default function CategoryIndex({
  categories,
  active,
  onSelect,
  loading,
  error,
  onRetry,
}) {
  return (
    <section className="ce-section" aria-labelledby="categories-heading">
      <div className="ce-section-head">
        <div>
          <p className="ce-micro ce-muted">Departments</p>
          <h2 id="categories-heading" className="ce-h2">Browse the catalogue</h2>
        </div>
      </div>
      <CategoryDirectory
        categories={categories}
        active={active}
        onSelect={onSelect}
        loading={loading}
        error={error}
        onRetry={onRetry}
      />
    </section>
  );
}
