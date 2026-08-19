/**
 * Local-disk brand logo storage — same "raw bytes, no cloud storage, served
 * statically from app.ts" approach as products.image.service.ts, just
 * writing under uploads/brands instead of uploads/products.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { brands } from "../../db/schema/index.js";
import { ApiError } from "../../utils/apiError.js";

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads", "brands");
const PUBLIC_PATH_PREFIX = "/uploads/brands";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const CONTENT_TYPE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export interface UploadedBrandLogo {
  logoUrl: string;
}

/** Saves the uploaded file and points the brand's logo_url at it — the Settings page's "Brand Profile" tab. */
export async function uploadBrandLogo(brandId: string, fileBuffer: Buffer, contentType: string): Promise<UploadedBrandLogo> {
  const extension = CONTENT_TYPE_EXTENSIONS[contentType.split(";")[0]?.trim() ?? ""];
  if (!extension) {
    throw ApiError.badRequest(`Unsupported image type "${contentType}" — use JPEG, PNG, WEBP, or GIF`);
  }
  if (fileBuffer.length === 0) throw ApiError.badRequest("Request body must be the raw image bytes");
  if (fileBuffer.length > MAX_IMAGE_BYTES) throw ApiError.badRequest("Logo must be 5MB or smaller");

  const [brand] = await db.select({ id: brands.id }).from(brands).where(eq(brands.id, brandId)).limit(1);
  if (!brand) throw ApiError.notFound(`Brand ${brandId} does not exist`);

  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const filename = `${brandId}-${Date.now()}.${extension}`;
  await fs.writeFile(path.join(UPLOAD_DIR, filename), fileBuffer);

  const logoUrl = `${PUBLIC_PATH_PREFIX}/${filename}`;
  await db.update(brands).set({ logoUrl, updatedAt: sql`now()` }).where(eq(brands.id, brandId));

  return { logoUrl };
}
