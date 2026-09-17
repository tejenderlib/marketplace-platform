/**
 * HomePage (BUY marketplace): public storefront composition.
 * BuyHero banner (untouched) → full-width live DiscoveryGrid.
 * Category discovery lives in the global header (single mega-menu
 * system); backend filtering (search, sale-type, category via
 * mega-menu explore) is untouched. Browsing, search and product
 * details are public; favorites, sell, checkout and the admin app
 * enforce auth themselves.
 */

import BuyHero from "./BuyHero.jsx";
import DiscoveryGrid from "./DiscoveryGrid.jsx";
import { formatCondition } from "../../data/listings.js";

export default function HomePage(props) {
  const {
    condition,
    onSelectCondition,
    minPrice,
    maxPrice,
    onMinPriceChange,
    onMaxPriceChange,
  } = props;
  const conditionLabel = condition ? formatCondition(condition) : "";

  return (
    <div className="buy-page">
      <BuyHero />
      <div className="buy-layout">
        <DiscoveryGrid
          {...props}
          query={props.debouncedQuery}
          condition={condition}
          conditionLabel={conditionLabel}
          minPrice={minPrice}
          maxPrice={maxPrice}
          onClearCondition={() => onSelectCondition("")}
          onClearPrice={() => {
            onMinPriceChange("");
            onMaxPriceChange("");
          }}
        />
      </div>
    </div>
  );
}
