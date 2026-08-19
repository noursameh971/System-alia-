import { API_BASE_URL } from "./env";

/** Resolves a stored image_url into something an <img src> can load directly: absolute external URLs pass through unchanged, relative upload paths (e.g. "/uploads/products/xyz.jpg") get the backend's origin prefixed on. */
export function resolveImageUrl(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null;
  if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
  return `${API_BASE_URL}${imageUrl.startsWith("/") ? "" : "/"}${imageUrl}`;
}
