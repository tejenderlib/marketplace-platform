/**
 * HomePage: premium homepage composition. Reuses the redesigned
 * DiscoveryGrid/ListingCard for fresh listings; hero, spotlight, category
 * index, and trust sections are fed by the SAME discovery payload and
 * category source — nothing invented.
 */

import DiscoveryGrid from "./DiscoveryGrid.jsx";
import AuctionSpotlight from "./AuctionSpotlight.jsx";
import CategoryIndex from "./CategoryIndex.jsx";
import HomeHero from "./HomeHero.jsx";
import TrustStrip from "./TrustStrip.jsx";

export default function HomePage(props) {
  const {
    items,
    loading,
    query,
    debouncedQuery,
    onQueryChange,
    categories,
    activeCategory,
    onSelectCategory,
    categoriesLoading,
    categoriesError,
    onCategoriesRetry,
    onViewAllAuctions,
  } = props;
  return (
    <>
      <HomeHero
        items={items}
        loading={loading}
        query={query}
        onQueryChange={onQueryChange}
      />
      <AuctionSpotlight items={items} onViewAll={onViewAllAuctions} />
      <CategoryIndex
        categories={categories}
        active={activeCategory}
        onSelect={onSelectCategory}
        loading={categoriesLoading}
        error={categoriesError}
        onRetry={onCategoriesRetry}
      />
      <DiscoveryGrid {...props} query={debouncedQuery} />
      <TrustStrip />
    </>
  );
}
