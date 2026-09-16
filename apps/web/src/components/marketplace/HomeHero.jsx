/**
 * HomeHero: premium masthead composition + editorial feature drawn from
 * REAL available listings only. First live item is the feature; next two
 * are secondary. Skeletons while loading; section collapses when empty.
 */

import { Link } from "./links.jsx";
import ListingCardSkeleton from "./ListingCardSkeleton.jsx";
import ProductMedia from "./ProductMedia.jsx";
import ProductPrice from "./ProductPrice.jsx";
import SaleTypeMark from "./SaleTypeMark.jsx";
import SearchField from "./SearchField.jsx";

function FeatureMain({ listing }) {
  return (
    <Link className="ce-feature-main" href={`#/listing/${listing.id}`} label={listing.title}>
      <span className="ce-feature-media">
        <ProductMedia listing={listing} size="lg" />
      </span>
      <span className="ce-feature-body">
        <SaleTypeMark listing={listing} />
        <span className="ce-feature-title">{listing.title}</span>
        <ProductPrice listing={listing} size="lg" />
        {[listing.location, listing.condition].filter(Boolean).join(" · ") ? (
          <span className="ce-small ce-muted">
            {[listing.location, listing.condition].filter(Boolean).join(" · ")}
          </span>
        ) : null}
      </span>
    </Link>
  );
}

function FeatureRow({ listing }) {
  return (
    <Link className="ce-feature-row" href={`#/listing/${listing.id}`} label={listing.title}>
      <span className="ce-feature-row-media">
        <ProductMedia listing={listing} />
      </span>
      <span className="ce-feature-row-body">
        <SaleTypeMark listing={listing} />
        <span className="ce-feature-row-title">{listing.title}</span>
        <ProductPrice listing={listing} />
      </span>
    </Link>
  );
}

export default function HomeHero({ items, loading, query, onQueryChange }) {
  const features = items.slice(0, 3);
  return (
    <section className="ce-hero" aria-labelledby="hero-heading">
      <div className="ce-hero-intro">
        <p className="ce-micro">Curated marketplace · India</p>
        <h1 id="hero-heading" className="ce-display">
          Exceptional finds, from sellers you can trust
        </h1>
        <p className="ce-body ce-muted">
          Fixed-price pieces, considered offers, and live auctions — published
          directly by sellers and moderated after listing.
        </p>
        <div className="ce-hero-search">
          <SearchField query={query} onQueryChange={onQueryChange} size="lg" id="hero-search" label="Search featured listings" />
        </div>
      </div>
      {loading ? (
        <div className="ce-hero-features" aria-label="Loading featured listings">
          {[0, 1, 2].map((i) => (
            <ListingCardSkeleton key={i} />
          ))}
        </div>
      ) : features.length > 0 ? (
        <div className="ce-hero-features">
          <FeatureMain listing={features[0]} />
          <div className="ce-hero-side">
            {features.slice(1).map((listing) => (
              <FeatureRow key={listing.id} listing={listing} />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
