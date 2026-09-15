/** Shared Sell constants + validation (mirrors backend rules; server stays authoritative). */

export const CONDITIONS = [
  ["NEW", "New"],
  ["LIKE_NEW", "Like new"],
  ["GOOD", "Good"],
  ["FAIR", "Fair"],
  ["POOR", "Poor"],
  ["FOR_PARTS", "For parts"],
];

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export function toMinor(rupees) {
  const value = Number(String(rupees ?? "").replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
}

export function fromMinor(minor) {
  if (minor == null) return "";
  return String(minor / 100);
}

export function conditionLabel(value) {
  return CONDITIONS.find(([key]) => key === value)?.[1] ?? value ?? "—";
}

export function validateBasics(form) {
  const errors = {};
  const title = (form.title ?? "").trim();
  if (title.length < 3) errors.title = "Title needs at least 3 characters.";
  else if (title.length > 180) errors.title = "Title must be 180 characters or fewer.";
  if (!form.category_id) errors.category_id = "Choose a category.";
  if (!form.condition) errors.condition = "Choose a condition.";
  if ((form.city ?? "").trim().length < 2) errors.city = "City needs at least 2 characters.";
  if (!/^[A-Z]{2}$/.test(form.country_code ?? "")) {
    errors.country_code = "Use a 2-letter country code (e.g. IN).";
  }
  if ((form.description ?? "").length > 10000) {
    errors.description = "Description must be 10000 characters or fewer.";
  }
  return errors;
}

export function validateSale(form) {
  const errors = {};
  if (form.sale_type === "FIXED_PRICE") {
    if (toMinor(form.price_rupees) == null) errors.price_rupees = "Enter a price greater than ₹0.";
  } else {
    if (toMinor(form.starting_rupees) == null) {
      errors.starting_rupees = "Enter a starting bid greater than ₹0.";
    }
    if (toMinor(form.increment_rupees) == null) {
      errors.increment_rupees = "Enter a minimum increment greater than ₹0.";
    }
    const reserveRaw = String(form.reserve_rupees ?? "").trim();
    if (reserveRaw !== "" && toMinor(reserveRaw) == null && Number(reserveRaw) !== 0) {
      errors.reserve_rupees = "Enter a valid reserve (or leave blank for none).";
    }
    if (!form.starts_at) errors.starts_at = "Choose a start time.";
    if (!form.ends_at) errors.ends_at = "Choose an end time.";
    if (form.starts_at && form.ends_at && new Date(form.ends_at) <= new Date(form.starts_at)) {
      errors.ends_at = "End time must be after start time.";
    }
  }
  return errors;
}

/** Build a POST /catalog/listings body from wizard state. */
export function listingCreateBody(form) {
  const base = {
    category_id: form.category_id,
    sale_type: form.sale_type,
    title: form.title.trim(),
    description: form.description?.trim() ? form.description.trim() : null,
    condition: form.condition,
    currency: "INR",
    offers_enabled: form.sale_type === "FIXED_PRICE" ? Boolean(form.offers_enabled) : false,
    city: form.city.trim(),
    region: form.region?.trim() ? form.region.trim() : null,
    country_code: form.country_code,
    postal_code: form.postal_code?.trim() ? form.postal_code.trim() : null,
  };
  if (form.sale_type === "FIXED_PRICE") {
    base.fixed_price_minor = toMinor(form.price_rupees);
  }
  return base;
}

/** Build a PATCH body (sale_type is immutable server-side, never sent). */
export function listingPatchBody(form) {
  const body = { ...listingCreateBody(form) };
  delete body.sale_type;
  return body;
}

/** Build a POST /auctions body from wizard state (listing created first). */
export function auctionCreateBody(form, listingId) {
  const reserveRaw = String(form.reserve_rupees ?? "").trim();
  return {
    listing_id: listingId,
    starting_bid_minor: toMinor(form.starting_rupees),
    minimum_increment_minor: toMinor(form.increment_rupees),
    currency: "INR",
    reserve_minor: reserveRaw === "" ? null : Math.round(Number(reserveRaw) * 100),
    starts_at: new Date(form.starts_at).toISOString(),
    ends_at: new Date(form.ends_at).toISOString(),
  };
}

export function toLocalInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
