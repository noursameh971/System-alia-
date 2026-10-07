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

const CONTENT_TYPE_EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
} as const;

export type ReceiptContentType = keyof typeof CONTENT_TYPE_EXTENSIONS;

export interface UploadedReceiptFile {
  url: string;
}

export interface StoredReceiptFile extends UploadedReceiptFile {
  /** What the bytes actually are — which can differ from what the client claimed (see sniffContentType). */
  contentType: ReceiptContentType;
}

/**
 * The file's real type, from its leading bytes. The Content-Type header is
 * whatever the client says; a receipt is served back to every admin who
 * opens it, so the stored bytes must really be the image or PDF the URL's
 * extension claims (an HTML page labelled image/png is refused here).
 */
export function sniffContentType(bytes: Buffer): ReceiptContentType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.length >= 12 && bytes.toString("latin1", 0, 4) === "RIFF" && bytes.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  if (bytes.length >= 6 && /^GIF8[79]a$/.test(bytes.toString("latin1", 0, 6))) return "image/gif";
  if (bytes.length >= 5 && bytes.toString("latin1", 0, 5) === "%PDF-") return "application/pdf";
  return null;
}

/**
 * Validates and writes one receipt file. Shared by the Finance page's
 * upload button (uploadReceiptFile below) and the assistant's attachments
 * (assistant/attachments.service.ts), so a receipt attached either way
 * lives in the same place and opens the same way from an expense row.
 */
export async function storeReceiptFile(
  fileBuffer: Buffer,
  claimedContentType: string,
  allowed: readonly ReceiptContentType[] = Object.keys(CONTENT_TYPE_EXTENSIONS) as ReceiptContentType[],
): Promise<StoredReceiptFile> {
  const claimed = claimedContentType.split(";")[0]?.trim() ?? "";
  if (!(allowed as readonly string[]).includes(claimed)) {
    throw ApiError.badRequest(`Unsupported file type "${claimedContentType}" — use ${describeTypes(allowed)}`);
  }
  if (fileBuffer.length === 0) throw ApiError.badRequest("Request body must be the raw file bytes");
  if (fileBuffer.length > MAX_FILE_BYTES) throw ApiError.badRequest("File must be 8MB or smaller");

  // Phones and browsers mislabel images among themselves (a PNG screenshot
  // saved as .jpg), so a different *allowed* type is fine — it's stored
  // under its real type. Anything that isn't one of them is refused.
  const contentType = sniffContentType(fileBuffer);
  if (!contentType || !allowed.includes(contentType)) {
    throw ApiError.badRequest(`This file isn't a valid ${describeTypes(allowed)} file`);
  }

  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  // No owning row to key the filename off (see the module comment). The
  // directory is served without auth (app.ts), so the name is the only
  // thing keeping a receipt private: 128 random bits makes it unguessable.
  const filename = `${Date.now()}-${crypto.randomBytes(16).toString("hex")}.${CONTENT_TYPE_EXTENSIONS[contentType]}`;
  await fs.writeFile(path.join(UPLOAD_DIR, filename), fileBuffer);

  return { url: `${PUBLIC_PATH_PREFIX}/${filename}`, contentType };
}

function describeTypes(types: readonly ReceiptContentType[]): string {
  const names = types.map((type) => (type === "application/pdf" ? "PDF" : type.slice("image/".length).toUpperCase()));
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} or ${names.at(-1)}` : names.join("");
}

export async function uploadReceiptFile(fileBuffer: Buffer, contentType: string): Promise<UploadedReceiptFile> {
  const { url } = await storeReceiptFile(fileBuffer, contentType);
  return { url };
}
