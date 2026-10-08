import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { brands, kbDocuments, ledgerEntities } from "../../db/schema/index.js";
import { ApiError } from "../../utils/apiError.js";
import { ReceiptReadError, transcribeDocumentImage } from "../assistant/receiptReader.js";
import { sniffContentType } from "../uploads/uploads.image.service.js";
import { chunkText } from "./chunker.js";
import { writeDocument } from "./index.service.js";

/**
 * Company documents in the knowledge base: supplier contracts, price
 * lists, policies. Uploaded by an admin, stored on disk next to receipts,
 * split into chunks and indexed for search_knowledge.
 *
 * Read as: PDF → its text layer (page by page, so answers can cite a
 * page); plain text / Markdown / CSV → as is; a photo or scan → transcribed
 * by the vision model.
 */

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads", "knowledge");
const PUBLIC_PATH_PREFIX = "/uploads/knowledge";
const MAX_FILE_BYTES = 8 * 1024 * 1024;
/** ~250 pages of dense text. Past this, a document is better split by hand into the parts that matter. */
const MAX_CHUNKS = 600;

const TEXT_TYPES: Record<string, string> = { "text/plain": "txt", "text/markdown": "md", "text/csv": "csv" };
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export interface KnowledgeDocumentView {
  id: string;
  title: string;
  brandId: string | null;
  ledgerEntityId: string | null;
  ledgerEntityName: string | null;
  fileUrl: string | null;
  contentType: string | null;
  status: "ready" | "failed";
  error: string | null;
  chunkCount: number;
  createdAt: Date;
}

/** Text per page (a text file is one "page"). */
async function readPages(bytes: Buffer, contentType: string): Promise<string[]> {
  if (contentType === "application/pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    let pdf;
    try {
      pdf = await getDocumentProxy(new Uint8Array(bytes));
    } catch {
      throw ApiError.badRequest("This PDF couldn't be opened — it may be damaged or password-protected");
    }
    const { text } = await extractText(pdf, { mergePages: false });
    if (text.join("").replace(/\s/g, "").length < 20) {
      throw ApiError.badRequest("This PDF is a scan with no text in it — upload photos of its pages instead, and they'll be transcribed");
    }
    return text;
  }
  if (contentType in TEXT_TYPES) {
    const text = bytes.toString("utf8");
    if (text.includes("\u0000")) throw ApiError.badRequest("This doesn't look like a text file");
    return [text];
  }
  try {
    return [await transcribeDocumentImage(bytes, contentType as (typeof IMAGE_TYPES)[number])];
  } catch (err) {
    if (err instanceof ReceiptReadError) throw ApiError.badRequest(err.message);
    throw err;
  }
}

function resolveType(bytes: Buffer, claimed: string, fileName: string): string {
  const base = claimed.split(";")[0]?.trim().toLowerCase() ?? "";
  const sniffed = sniffContentType(bytes);
  if (sniffed === "application/pdf" || (sniffed && (IMAGE_TYPES as readonly string[]).includes(sniffed))) return sniffed;
  // Text has no magic bytes; browsers often send .md/.csv as "" or octet-stream.
  if (base in TEXT_TYPES) return base;
  const extension = path.extname(fileName).toLowerCase();
  if (extension === ".md") return "text/markdown";
  if (extension === ".csv") return "text/csv";
  if (extension === ".txt") return "text/plain";
  throw ApiError.badRequest("Upload a PDF, a text file (.txt, .md, .csv) or a photo of the document (JPEG, PNG, WEBP)");
}

async function assertTags(brandId: string | null, ledgerEntityId: string | null): Promise<void> {
  if (brandId) {
    const [brand] = await db.select({ id: brands.id }).from(brands).where(eq(brands.id, brandId)).limit(1);
    if (!brand) throw ApiError.badRequest("That workspace doesn't exist");
  }
  if (ledgerEntityId) {
    const [entity] = await db.select({ brandId: ledgerEntities.brandId }).from(ledgerEntities).where(eq(ledgerEntities.id, ledgerEntityId)).limit(1);
    if (!entity) throw ApiError.badRequest("That supplier doesn't exist");
    if (brandId && entity.brandId !== brandId) throw ApiError.badRequest("That supplier belongs to a different workspace");
  }
}

export async function uploadKnowledgeDocument(input: {
  bytes: Buffer;
  contentType: string;
  fileName: string;
  title?: string;
  brandId?: string | null;
  ledgerEntityId?: string | null;
  userId: string;
}): Promise<KnowledgeDocumentView> {
  if (input.bytes.length === 0) throw ApiError.badRequest("Request body must be the raw file bytes");
  if (input.bytes.length > MAX_FILE_BYTES) throw ApiError.badRequest("File must be 8MB or smaller");
  const contentType = resolveType(input.bytes, input.contentType, input.fileName);
  // A supplier's document belongs to that supplier's workspace.
  let brandId = input.brandId ?? null;
  const ledgerEntityId = input.ledgerEntityId ?? null;
  await assertTags(brandId, ledgerEntityId);
  if (ledgerEntityId && !brandId) {
    const [entity] = await db.select({ brandId: ledgerEntities.brandId }).from(ledgerEntities).where(eq(ledgerEntities.id, ledgerEntityId)).limit(1);
    brandId = entity?.brandId ?? null;
  }

  const title = (input.title?.trim() || input.fileName.replace(/\.[^.]+$/, "") || "Untitled document").slice(0, 300);
  const pages = await readPages(input.bytes, contentType);

  // A page number in each chunk lets answers cite "p.3"; a single-page text file doesn't need one.
  const chunks = pages.flatMap((page, index) =>
    chunkText(page).map((chunk) => (pages.length > 1 ? `${title} (p.${index + 1}): ${chunk}` : `${title}: ${chunk}`)),
  );
  if (chunks.length === 0) throw ApiError.badRequest("No text was found in this document");
  if (chunks.length > MAX_CHUNKS) {
    throw ApiError.badRequest(`This document is too long to index (${chunks.length} sections; the limit is ${MAX_CHUNKS}) — upload the parts that matter`);
  }

  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const extension = contentType === "application/pdf" ? "pdf" : (TEXT_TYPES[contentType] ?? contentType.split("/")[1]);
  const filename = `${Date.now()}-${crypto.randomBytes(16).toString("hex")}.${extension}`;
  await fs.writeFile(path.join(UPLOAD_DIR, filename), input.bytes);

  const id = await writeDocument({
    sourceType: "upload",
    sourceId: null,
    brandId,
    ledgerEntityId,
    title,
    chunks,
    fileUrl: `${PUBLIC_PATH_PREFIX}/${filename}`,
    contentType,
    uploadedBy: input.userId,
  });
  const [view] = await listKnowledgeDocuments(id);
  return view!;
}

export async function listKnowledgeDocuments(onlyId?: string): Promise<KnowledgeDocumentView[]> {
  const rows = await db
    .select({ doc: kbDocuments, entityName: ledgerEntities.name })
    .from(kbDocuments)
    .leftJoin(ledgerEntities, eq(ledgerEntities.id, kbDocuments.ledgerEntityId))
    .where(onlyId ? and(eq(kbDocuments.sourceType, "upload"), eq(kbDocuments.id, onlyId)) : eq(kbDocuments.sourceType, "upload"))
    .orderBy(desc(kbDocuments.createdAt));
  return rows.map(({ doc, entityName }) => ({
    id: doc.id,
    title: doc.title,
    brandId: doc.brandId,
    ledgerEntityId: doc.ledgerEntityId,
    ledgerEntityName: entityName,
    fileUrl: doc.fileUrl,
    contentType: doc.contentType,
    status: doc.status,
    error: doc.error,
    chunkCount: doc.chunkCount,
    createdAt: doc.createdAt,
  }));
}

export async function deleteKnowledgeDocument(id: string): Promise<void> {
  const [deleted] = await db
    .delete(kbDocuments)
    .where(and(eq(kbDocuments.id, id), eq(kbDocuments.sourceType, "upload")))
    .returning({ fileUrl: kbDocuments.fileUrl });
  if (!deleted) throw ApiError.notFound("Document not found");
  if (deleted.fileUrl?.startsWith(`${PUBLIC_PATH_PREFIX}/`)) {
    await fs.rm(path.join(UPLOAD_DIR, path.basename(deleted.fileUrl)), { force: true });
  }
}

export interface KnowledgeStatus {
  enabled: boolean;
  documents: number;
  /** Indexed rows per record type, e.g. { expense: 70, product: 82 }. */
  records: Record<string, number>;
  chunks: number;
}

export async function getKnowledgeStatus(enabled: boolean): Promise<KnowledgeStatus> {
  const counts = await db.execute(sql`select source_type, count(*)::int as n, sum(chunk_count)::int as chunks from kb_documents group by source_type`);
  const records: Record<string, number> = {};
  let documents = 0;
  let chunks = 0;
  for (const row of counts.rows as { source_type: string; n: number; chunks: number }[]) {
    chunks += row.chunks ?? 0;
    if (row.source_type === "upload") documents = row.n;
    else records[row.source_type] = row.n;
  }
  return { enabled, documents, records, chunks };
}

