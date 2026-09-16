/**
 * FavoriteButton: restrained circular save control. Sibling-positioned
 * (never nested inside the card link) with a 44px hit area.
 */

export default function FavoriteButton({ listing, isFavorite, onToggleFavorite }) {
  function handle(e) {
    e.preventDefault();
    e.stopPropagation();
    onToggleFavorite(listing.id);
  }
  return (
    <button
      type="button"
      className={isFavorite ? "ce-fav is-active" : "ce-fav"}
      onClick={handle}
      aria-pressed={isFavorite}
      aria-label={isFavorite ? `Remove ${listing.title} from favorites` : `Save ${listing.title} to favorites`}
      title={isFavorite ? "Saved" : "Save"}
    >
      <span aria-hidden="true">♥</span>
    </button>
  );
}
