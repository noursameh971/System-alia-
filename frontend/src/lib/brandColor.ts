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
