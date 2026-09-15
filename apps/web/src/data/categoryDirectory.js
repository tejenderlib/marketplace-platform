/**
 * Single shared category-directory data source (Phase 10.1).
 *
 * The header mega-menu (CategoryMegaMenu) consumes
 * `buildDirectory(apiCategories)` as its single curated data source.
 *
 * Backend reality: GET /catalog/categories returns a FLAT list of
 * `{ id, name, slug, parent_id }` (parent_id is almost always null in
 * practice). This module therefore:
 *  1. Uses a true parent/child tree when the API provides one, or
 *  2. Maps each real API category onto the curated starter groups by
 *     name/keyword matching, or
 *  3. Collects unmatched real categories into a "More" overflow group so
 *     every filterable category stays reachable.
 *
 * Every rendered link always resolves to a REAL backend id (or "All"):
 * an unmatched display-only sub falls back to its group target, then "All".
 * Nothing renders a dead button.
 *
 * To add categories later, extend CATEGORY_PRESET below (and optionally
 * GROUP_KEYWORDS). No other file holds a category list.
 */

export const CATEGORY_PRESET = [
  {
    key: "households",
    name: "Households",
    subs: [
      "Furniture",
      "Home Decor",
      "Kitchen & Dining",
      "Storage & Organization",
      "Lighting",
      "Bedding & Furnishing",
    ],
  },
  {
    key: "electronics",
    name: "Electronics",
    subs: [
      "Mobiles & Tablets",
      "Computers & Accessories",
      "TVs & Home Audio",
      "Cameras",
      "Gaming",
      "Wearables",
    ],
  },
  {
    key: "vehicles",
    name: "Vehicles",
    subs: ["Cars", "Bikes", "Scooters", "Commercial Vehicles", "Auto Parts", "Accessories"],
  },
  {
    key: "fashion",
    name: "Fashion",
    subs: ["Men", "Women", "Kids", "Shoes", "Bags", "Watches & Accessories"],
  },
  {
    key: "home-garden",
    name: "Home & Garden",
    subs: ["Appliances", "Garden & Outdoor", "Tools", "Bathroom", "Cleaning", "Safety & Security"],
  },
  {
    key: "industrial",
    name: "Industrial & Equipment",
    subs: [
      "Construction Equipment",
      "Agricultural Equipment",
      "Generators",
      "Machinery",
      "Commercial Tools",
      "Heavy Equipment",
    ],
  },
];

/** Extra keyword hints so real API names land in the right group. */
const GROUP_KEYWORDS = {
  households: ["furnit", "decor", "kitchen", "dining", "storage", "lighting", "bedding", "sofa", "chair", "table"],
  electronics: ["mobile", "tablet", "phone", "computer", "laptop", "tv", "audio", "camera", "gaming", "wearable", "gadget"],
  vehicles: ["car", "bike", "scooter", "moto", "vehicle", "auto", "wheel", "tire", "tyre", "truck", "trailer", "transport"],
  fashion: ["men", "women", "kid", "cloth", "shoe", "bag", "watch", "apparel", "wear"],
  "home-garden": ["appliance", "garden", "outdoor", "tool", "bathroom", "cleaning", "safety", "lawn"],
  industrial: [
    "construct",
    "agricult",
    "tractor",
    "harvest",
    "generator",
    "machin",
    "excavat",
    "backhoe",
    "dozer",
    "crane",
    "loader",
    "forklift",
    "aerial",
    "lift",
    "trencher",
    "earthmov",
    "industrial",
    "heav",
    "equipment",
  ],
};

function normalize(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Score how well an API category name fits a preset group (higher = better). */
function groupScore(group, normName) {
  const keywords = GROUP_KEYWORDS[group.key] ?? [];
  let score = 0;
  for (const kw of keywords) {
    if (normName.includes(kw)) score += kw.length >= 6 ? 2 : 1;
  }
  if (normName.includes(normalize(group.name))) score += 3;
  for (const sub of group.subs) {
    const normSub = normalize(sub);
    if (normSub && (normName.includes(normSub) || normSub.includes(normName))) score += 4;
  }
  return score;
}

function matchSub(subName, candidates) {
  const normSub = normalize(subName);
  for (const cat of candidates) {
    if (normalize(cat.name) === normSub) return cat;
  }
  for (const cat of candidates) {
    const normCat = normalize(cat.name);
    if (
      normCat &&
      normSub &&
      (normCat.includes(normSub) || normSub.includes(normCat))
    )
      return cat;
  }
  return null;
}

/**
 * Build the directory consumed by both the mega-menu and the homepage.
 * Returns: [{ key, name, targetId, links: [{ name, targetId }] }]
 * `targetId` is always a real category id or "All" — never null — so every
 * rendered control maps onto the existing selectCategory(id) contract.
 */
export function buildDirectory(apiCategories) {
  const list = Array.isArray(apiCategories) ? apiCategories : [];

  // Path 1: the API provides a real parent/child tree — use it verbatim.
  const byId = new Map(list.map((cat) => [String(cat.id), cat]));
  const hasHierarchy = list.some(
    (cat) => cat.parent_id != null && byId.has(String(cat.parent_id)),
  );
  if (hasHierarchy) {
    const childrenOf = new Map();
    for (const cat of list) {
      if (cat.parent_id != null && byId.has(String(cat.parent_id))) {
        const key = String(cat.parent_id);
        if (!childrenOf.has(key)) childrenOf.set(key, []);
        childrenOf.get(key).push(cat);
      }
    }
    const groups = [];
    for (const cat of list) {
      if (cat.parent_id != null && byId.has(String(cat.parent_id))) continue;
      const children = childrenOf.get(String(cat.id)) ?? [];
      groups.push({
        key: String(cat.id),
        name: cat.name,
        targetId: cat.id,
        links: children.map((child) => ({ name: child.name, targetId: child.id })),
      });
    }
    return groups;
  }

  // Path 2: flat API list — map real categories onto the curated groups.
  const remaining = [...list];
  const groups = CATEGORY_PRESET.map((preset) => {
    const links = [];
    for (const subName of preset.subs) {
      const hit = matchSub(subName, remaining);
      if (hit) {
        remaining.splice(remaining.indexOf(hit), 1);
        links.push({ name: hit.name, targetId: hit.id });
      } else {
        links.push({ name: subName, targetId: null });
      }
    }
    // A real category matching the group name becomes the heading target.
    const headingHit = matchSub(preset.name, remaining);
    let targetId = null;
    if (headingHit) {
      remaining.splice(remaining.indexOf(headingHit), 1);
      targetId = headingHit.id;
    }
    // Keyword-assign leftover categories to their best-fit group.
    for (let i = remaining.length - 1; i >= 0; i -= 1) {
      const norm = normalize(remaining[i].name);
      if (groupScore(preset, norm) > 0) {
        const [cat] = remaining.splice(i, 1);
        links.push({ name: cat.name, targetId: cat.id });
      }
    }
    if (targetId == null) {
      const firstReal = links.find((link) => link.targetId != null);
      targetId = firstReal ? firstReal.targetId : "All";
    }
    return {
      key: preset.key,
      name: preset.name,
      targetId,
      links: links.map((link) => ({
        name: link.name,
        targetId: link.targetId != null ? link.targetId : targetId,
      })),
    };
  });

  // Path 3: anything still unmatched stays reachable under "More".
  if (remaining.length > 0) {
    groups.push({
      key: "more",
      name: "More",
      targetId: "All",
      links: remaining.map((cat) => ({ name: cat.name, targetId: cat.id })),
    });
  }
  return groups;
}
