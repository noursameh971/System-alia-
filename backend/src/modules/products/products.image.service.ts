/**
 * Local-disk product image storage. There's no cloud storage (S3 etc.)
 * wired up in this environment, so an uploaded image is written straight to
 * disk under uploads/products and served statically by app.ts — the same
 * "raw bytes body, no multipart dependency" approach already used for the
 * Excel import route, just for images instead of spreadsheets.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { products } from "../../db/schema/index.js";
import { ApiError } from "../../utils/apiError.js";

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads", "products");
const PUBLIC_PATH_PREFIX = "/uploads/products";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const CONTENT_TYPE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export interface UploadedProductImage {
  imageUrl: string;
}

/** Saves the uploaded file and points the product's image_url at it — the Add/Edit modal's file-upload path (as opposed to just typing an external URL, which goes through the plain PATCH /variants/:id imageUrl field instead). */
export async function uploadProductImage(productId: string, fileBuffer: Buffer, contentType: string): Promise<UploadedProductImage> {
  const extension = CONTENT_TYPE_EXTENSIONS[contentType.split(";")[0]?.trim() ?? ""];
  if (!extension) {
    throw ApiError.badRequest(`Unsupported image type "${contentType}" — use JPEG, PNG, WEBP, or GIF`);
  }
  if (fileBuffer.length === 0) throw ApiError.badRequest("Request body must be the raw image bytes");
  if (fileBuffer.length > MAX_IMAGE_BYTES) throw ApiError.badRequest("Image must be 5MB or smaller");

  const [product] = await db.select({ id: products.id }).from(products).where(eq(products.id, productId)).limit(1);
  if (!product) throw ApiError.notFound(`Product ${productId} does not exist`);

  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const filename = `${productId}-${Date.now()}.${extension}`;
  await fs.writeFile(path.join(UPLOAD_DIR, filename), fileBuffer);

  const imageUrl = `${PUBLIC_PATH_PREFIX}/${filename}`;
  await db.update(products).set({ imageUrl, updatedAt: sql`now()` }).where(eq(products.id, productId));

  return { imageUrl };
}
