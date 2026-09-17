/**
 * SearchField: the single coherent search control, used in both the site
 * header (compact) and the homepage hero (large). Same App-owned query
 * state + debounce pipeline; submitting scrolls to results.
 */

export default function SearchField({ query, onQueryChange, size, id, label, placeholder, iconRight }) {
  function scrollToResults() {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document
      .getElementById("listings")
      ?.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
  }

  const icon = (
    <svg
      className={iconRight ? "ce-search-icon ce-search-icon--right" : "ce-search-icon"}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M16.5 16.5L21 21" />
    </svg>
  );

  return (
    <form
      className={size === "lg" ? "ce-search ce-search--lg" : "ce-search"}
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        scrollToResults();
      }}
    >
      {!iconRight && icon}
      <input
        id={id}
        type="search"
        value={query ?? ""}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder={placeholder ?? "Search for bikes, iPhones, laptops…"}
        aria-label={label ?? "Search the marketplace"}
      />
      {iconRight && icon}
      {query ? (
        <button
          type="button"
          className="ce-search-clear"
          onClick={() => onQueryChange("")}
          aria-label="Clear search"
        >
          <span aria-hidden="true">✕</span>
        </button>
      ) : null}
    </form>
  );
}
