// Deterministic per-brand accent color, keyed off the brand code. Not
// hardcoded per known brand (e.g. "if ALH then indigo") so a 3rd/4th brand
// automatically gets a consistent color with zero code changes — matching
// the brand_id-FK-for-growth design from Step 1. Purely a visual aid: it
// gives the workspace header a persistent, glanceable signal of which
// brand you're locked into, to cut down on the "moved stock for the wrong
// brand" mistake this whole refactor is about preventing.
const PALETTE = [
  "bg-indigo-600",
  "bg-rose-600",
  "bg-teal-600",
  "bg-amber-600",
  "bg-violet-600",
  "bg-emerald-600",
] as const;

// Same six colors as PALETTE above (Tailwind's *-600 shade), as hex — charts
// render to SVG via recharts, which needs an actual color value rather than
// a Tailwind class, but must still land on the *same* color per brand so a
// bar in a chart and that brand's avatar elsewhere read as "the same brand".
const HEX_PALETTE = [
  "#4f46e5", // indigo-600
  "#e11d48", // rose-600
  "#0d9488", // teal-600
  "#d97706", // amber-600
  "#7c3aed", // violet-600
  "#059669", // emerald-600
] as const;

// Two-stop gradients for chart bars — vivid rather than the old flat hex
// fills. Same "deterministic by hash, not hardcoded per brand name" design
// as PALETTE/HEX_PALETTE above, so a 3rd/4th brand automatically gets a
// consistent, distinct gradient with zero code changes.
const GRADIENT_PALETTE: readonly [string, string][] = [
  ["#6366f1", "#8b5cf6"], // indigo -> violet
  ["#e11d48", "#10b981"], // crimson -> emerald
  ["#0ea5e9", "#6366f1"], // sky -> indigo
  ["#f59e0b", "#ef4444"], // amber -> red
  ["#a855f7", "#ec4899"], // purple -> pink
  ["#10b981", "#0d9488"], // emerald -> teal
] as const;

function hashCode(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function getBrandAccentClass(code: string): string {
  return PALETTE[hashCode(code) % PALETTE.length] as string;
}

export function getBrandAccentHex(code: string): string {
  return HEX_PALETTE[hashCode(code) % HEX_PALETTE.length] as string;
}

/** [from, to] hex stops for a top-to-bottom chart-bar gradient, deterministic per brand code. */
export function getBrandGradientHex(code: string): [string, string] {
  return GRADIENT_PALETTE[hashCode(code) % GRADIENT_PALETTE.length] as [string, string];
}

/**
 * Up to 2 uppercase letters for a brand's logo badge — deliberately derived
 * from the brand NAME, not `code` (a workspace's code can be long, e.g. the
 * auto-generated "ALIAHIJAB", which is what was overflowing these small
 * fixed-size badges). Two words -> first letter of each ("Alia Hijab" ->
 * "AH"); one word -> its first two letters ("Noori" -> "NO").
 */
export function getBrandInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return `${words[0]![0]}${words[1]![0]}`.toUpperCase();
}
