import type { ProductVariantAttribute } from "./types";

/** Looks up one named attribute's value (e.g. "Color", "Size") off a variant's attribute list, case-insensitively. Returns "—" when absent, matching how the Product Profile drawer's table displays a missing attribute. */
export function attributeValue(attributes: ProductVariantAttribute[], name: string): string {
  return attributes.find((a) => a.attributeName.toLowerCase() === name.toLowerCase())?.value ?? "—";
}
