import { apiFetch } from "./client.js";
import { formatPrice } from "../data/listings.js";

function params(query) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== "" && value !== null && value !== undefined) {
      search.set(key, value);
    }
  }
  const suffix = search.toString() ? `?${search}` : "";
  return suffix;
}

/** GET /api/v1/catalog/categories (public). */
export function fetchCategories() {
  return apiFetch("/catalog/categories");
}

/** GET /api/v1/catalog/listings with backend filtering + pagination (public). */
export function fetchListings({ q, category_id, sale_type, status = "ACTIVE", limit = 12, offset = 0 } = {}) {
  return apiFetch(`/catalog/listings${params({ q, category_id, sale_type, status, limit, offset })}`);
}

/** GET /api/v1/catalog/listings/{id} (public). */
export function fetchListing(id) {
  return apiFetch(`/catalog/listings/${id}`);
}

/**
 * Small normalizer: adapts the real API shape to what storefront UI needs.
 * Only fields the API actually returns are used — no invented data.
 */
export function normalizeListing(api) {
  const images = Array.isArray(api.images) ? api.images : [];
  const primary = images.find((img) => img.is_primary) ?? images[0] ?? null;
  const location = [api.city, api.region].filter(Boolean).join(", ");
  const priceLabel =
    api.fixed_price_minor != null ? formatPrice(api.fixed_price_minor) : "Bids open";
  return {
    id: api.id,
    title: api.title,
    description: api.description,
    priceLabel,
    priceNote:
      api.sale_type === "AUCTION"
        ? api.auction
          ? "Current bid"
          : "Auction"
        : null,
    location,
    saleType: api.sale_type,
    isAuction: api.sale_type === "AUCTION",
    condition: api.condition,
    categoryId: api.category?.id ?? null,
    categoryName: api.category?.name ?? "",
    sellerId: api.seller?.id ?? null,
    sellerName: api.seller?.display_name ?? "Seller",
    imageCount: images.length,
    primaryImage: primary,
    images,
    auction: api.auction ?? null,
    status: api.status,
    currency: api.currency,
    createdAt: api.created_at,
    raw: api,
  };
}
