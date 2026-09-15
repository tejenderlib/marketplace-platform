/**
 * Compact header search bound to the SAME query state as the hero search
 * (App owns the state + debounce pipeline; backend search is untouched).
 * Shrinks gracefully via flex; full-width row on mobile.
 */
export default function HeaderSearch({ query, onQueryChange }) {
  function scrollToResults() {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document
      .getElementById("listings")
      ?.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
  }

  return (
    <form
      className="header-search"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        scrollToResults();
      }}
    >
      <svg
        className="header-search-icon"
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
      <input
        type="search"
        value={query ?? ""}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="Search listings…"
        aria-label="Search listings"
      />
      {query ? (
        <button
          type="button"
          className="header-search-clear"
          onClick={() => onQueryChange("")}
          aria-label="Clear search"
        >
          <span aria-hidden="true">✕</span>
        </button>
      ) : null}
    </form>
  );
}
