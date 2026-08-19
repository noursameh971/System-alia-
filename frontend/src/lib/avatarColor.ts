// Deterministic gradient placeholder for a product with no image — same
// "hash the identity string, index into a fixed palette" approach as
// lib/brandColor.ts, just a separate palette since products aren't brand
// hues (a product's card shouldn't visually claim to BE its brand).
const GRADIENT_PALETTE: readonly [string, string][] = [
  ["#6366f1", "#8b5cf6"], // indigo -> violet
  ["#f43f5e", "#f97316"], // rose -> orange
  ["#06b6d4", "#3b82f6"], // cyan -> blue
  ["#10b981", "#059669"], // emerald -> teal
  ["#f59e0b", "#d97706"], // amber -> orange
  ["#a855f7", "#d946ef"], // purple -> fuchsia
  ["#ef4444", "#ec4899"], // red -> pink
  ["#14b8a6", "#0ea5e9"], // teal -> sky
];

function hashCode(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** [from, to] hex stops for a CSS gradient, deterministic per name/id so the same product always gets the same placeholder color. */
export function getGradientForString(seed: string): [string, string] {
  return GRADIENT_PALETTE[hashCode(seed) % GRADIENT_PALETTE.length]!;
}

/** Up to 2 characters: first letter of the first two words, or the first 2 letters of a single word. */
export function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return `${words[0]![0]}${words[1]![0]}`.toUpperCase();
}
