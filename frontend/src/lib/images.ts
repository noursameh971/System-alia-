import { API_BASE_URL } from "./env";

/** Resolves a stored image_url into something an <img src> can load directly: absolute external URLs pass through unchanged, relative upload paths (e.g. "/uploads/products/xyz.jpg") get the backend's origin prefixed on. */
export function resolveImageUrl(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null;
  if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
  return `${API_BASE_URL}${imageUrl.startsWith("/") ? "" : "/"}${imageUrl}`;
}

const DATA_URL_PATTERN = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/;

/**
 * Converts a pasted `data:image/...;base64,...` URI into a real File, so it
 * can go through the same raw-bytes upload endpoint as a picked file instead
 * of being written into the `imageUrl` column — that column is capped at 500
 * chars (a real URL's length) and a base64 image is easily tens of thousands
 * of characters, so storing it there would just fail (or bloat every row).
 * Returns null for anything that isn't a base64 data URL — callers should
 * fall back to treating the value as a plain typed URL.
 */
export function dataUrlToFile(dataUrl: string, filename = "pasted-image"): File | null {
  const match = DATA_URL_PATTERN.exec(dataUrl.trim());
  if (!match) return null;
  const [, mimeType, base64] = match;
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const extension = mimeType.split("/")[1] ?? "png";
    return new File([bytes], `${filename}.${extension}`, { type: mimeType });
  } catch {
    return null;
  }
}
