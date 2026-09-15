/**
 * Shared display ordering for a product's variants: grouped by color (all
 * "Navy" rows adjacent, then all "Brown" rows, etc. — alphabetical since
 * colors are free text with no universal hierarchy the way sizes have),
 * and within each color group, sorted by size using the apparel hierarchy
 * below. Applied once here (listProductsWithVariants) rather than in each
 * frontend table/list, so every consumer of a product's `variants` array —
 * the Product Profile drawer's variant table, batch label printing, the
 * Products page's color chips — agrees on the same order automatically.
 */

// Canonical apparel size progression, keyed by a normalized abbreviation.
// Sizes not found here (a pure number like a pants/shoe size, or a one-off
// label like "Free Size") fall back to numeric or alphabetical ordering —
// see sizeRank below.
const SIZE_ORDER = ["XXS", "XS", "S", "S/M", "M", "M/L", "L", "L/XL", "XL", "XL/XXL", "XXL", "XXXL", "XXXXL"];

const SIZE_RANK = new Map<string, number>(SIZE_ORDER.map((size, index) => [size, index]));

// Real catalog data spells sizes out in full words ("Small", "X Large") as
// often as it uses abbreviations ("S", "XL") — both need to resolve to the
// same rank. Maps a normalized full-word (or alternate) spelling to its
// canonical abbreviation above.
const SIZE_ALIASES: Record<string, string> = {
  "EXTRA EXTRA SMALL": "XXS",
  "XX SMALL": "XXS",
  "EXTRA SMALL": "XS",
  "X SMALL": "XS",
  SMALL: "S",
  MEDIUM: "M",
  LARGE: "L",
  "X LARGE": "XL",
  "EXTRA LARGE": "XL",
  "XX LARGE": "XXL",
  "EXTRA EXTRA LARGE": "XXL",
  "XXX LARGE": "XXXL",
  "3X LARGE": "XXXL",
  "3XL": "XXXL",
  "XXXX LARGE": "XXXXL",
  "4X LARGE": "XXXXL",
  "4XL": "XXXXL",
};

/** Uppercases, and collapses hyphens/underscores/repeated whitespace to a single space, so "X-Large", "X_Large", and "X  Large" all normalize the same as "X LARGE". */
function normalizeSizeToken(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ");
}

/**
 * A known apparel size's position in SIZE_ORDER (after resolving full-word
 * spellings via SIZE_ALIASES); a purely numeric size (e.g. "36") sorts
 * numerically after every named size; anything else (freeform/unrecognized)
 * sorts last, alphabetically among itself via the localeCompare tie-break
 * in compareSizes below.
 */
function sizeRank(rawSize: string): number {
  const normalized = normalizeSizeToken(rawSize);
  const canonical = SIZE_ALIASES[normalized] ?? normalized;
  const known = SIZE_RANK.get(canonical);
  if (known !== undefined) return known;
  if (/^\d+(\.\d+)?$/.test(normalized)) return 1000 + Number(normalized);
  return Number.POSITIVE_INFINITY;
}

function compareSizes(a: string, b: string): number {
  const rankA = sizeRank(a);
  const rankB = sizeRank(b);
  // Compared as a boolean first, not via subtraction: two unrecognized
  // sizes both rank Infinity, and Infinity - Infinity is NaN — an invalid
  // comparator result that leaves Array.prototype.sort's ordering
  // undefined instead of falling through to the localeCompare tie-break.
  if (rankA !== rankB) return rankA - rankB;
  return a.localeCompare(b);
}

interface AttributedVariant {
  attributes: { attributeName: string; value: string }[];
}

function attributeValue(attributes: AttributedVariant["attributes"], name: string): string {
  return attributes.find((a) => a.attributeName.toLowerCase() === name)?.value ?? "";
}

/** Color (alphabetical, grouping) first, then size (apparel hierarchy) within each color. */
export function compareVariantsByColorAndSize<T extends AttributedVariant>(a: T, b: T): number {
  const colorCompare = attributeValue(a.attributes, "color").localeCompare(attributeValue(b.attributes, "color"));
  if (colorCompare !== 0) return colorCompare;
  return compareSizes(attributeValue(a.attributes, "size"), attributeValue(b.attributes, "size"));
}
