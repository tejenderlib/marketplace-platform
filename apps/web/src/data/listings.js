export function formatPrice(value) {
  return `₹${value.toLocaleString("en-IN")}`;
}

/**
 * Backend ItemCondition enum values with storefront labels.
 * The API has no USED value: pre-owned items surface as LIKE_NEW,
 * GOOD, FAIR, or POOR depending on what the seller declared.
 */
export const CONDITION_OPTIONS = [
  { value: "NEW", label: "New" },
  { value: "LIKE_NEW", label: "Like New" },
  { value: "GOOD", label: "Good" },
  { value: "FAIR", label: "Fair" },
  { value: "POOR", label: "Poor" },
  { value: "FOR_PARTS", label: "For Parts" },
];

export function formatCondition(value) {
  return CONDITION_OPTIONS.find((c) => c.value === value)?.label ?? value;
}
