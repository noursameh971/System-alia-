/**
 * Local-disk receipt/invoice file storage — same "raw bytes, no cloud
 * storage, served statically from app.ts" approach as
 * products/products.image.service.ts and brands/brands.image.service.ts.
 *
 * Unlike those two, this one is standalone: a receipt doesn't have an
 * owning DB row yet at upload time (the expense or opening-balance modal
 * that owns it is still being filled out client-side), so this just writes
 * the file and hands back its URL for the caller to include in the
 * create/update payload — the same way a hand-typed receipt URL always
 * worked, just sourced from an upload instead of a paste.
 */
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { ApiError } from "../../utils/apiError.js";

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads", "receipts");
const PUBLIC_PATH_PREFIX = "/uploads/receipts";
const MAX_FILE_BYTES = 8 * 1024 * 1024;

const CONTENT_TYPE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
};

export interface UploadedReceiptFile {
  url: string;
}

export async function uploadReceiptFile(fileBuffer: Buffer, contentType: string): Promise<UploadedReceiptFile> {
  const extension = CONTENT_TYPE_EXTENSIONS[contentType.split(";")[0]?.trim() ?? ""];
  if (!extension) {
    throw ApiError.badRequest(`Unsupported file type "${contentType}" — use JPEG, PNG, WEBP, GIF, or PDF`);
  }
  if (fileBuffer.length === 0) throw ApiError.badRequest("Request body must be the raw file bytes");
  if (fileBuffer.length > MAX_FILE_BYTES) throw ApiError.badRequest("File must be 8MB or smaller");

  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  // No owning row to key the filename off (see the module comment) — a
  // timestamp + random suffix keeps concurrent uploads from colliding
  // instead of the "<entityId>-<timestamp>" scheme the entity-scoped
  // uploaders use.
  const filename = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}.${extension}`;
  await fs.writeFile(path.join(UPLOAD_DIR, filename), fileBuffer);

  return { url: `${PUBLIC_PATH_PREFIX}/${filename}` };
}
