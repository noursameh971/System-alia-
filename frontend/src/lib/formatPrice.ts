/**
 * Shared money formatter for the whole app: thousands separators, and no
 * ".00" tail on round numbers (e.g. `1150` -> "1,150 EGP", `1399.3` ->
 * "1,399.3 EGP"). Used anywhere a variant/product price is displayed —
 * see products table, product profile drawer, and QR sticker labels.
 */
export function formatPrice(value: number | null | undefined, currency: string | null | undefined = "EGP"): string {
  if (value == null) return "—";
  const formatted = value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return `${formatted} ${currency ?? "EGP"}`;
}
