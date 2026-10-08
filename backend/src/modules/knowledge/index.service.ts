import crypto from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { kbChunks, kbDocuments } from "../../db/schema/index.js";
import { embedDocuments } from "./embedder.js";

/**
 * The one write path into the knowledge index, shared by uploaded documents
 * (documents.service.ts) and mirrored business records (records.ts): store
 * the document row, replace its chunks, embed them.
 */

export interface IndexableDocument {
  sourceType: string;
  /** The mirrored row; null for an upload. */
  sourceId: string | null;
  brandId: string | null;
  ledgerEntityId?: string | null;
  title: string;
  /** Already chunked. Each chunk is stored and embedded as written. */
  chunks: string[];
  fileUrl?: string | null;
  contentType?: string | null;
  uploadedBy?: string | null;
}

export function contentHash(title: string, chunks: string[]): string {
  return crypto.createHash("sha256").update(JSON.stringify([title, chunks])).digest("hex");
}

/**
 * Inserts or replaces one document and its chunks. Embedding happens before
 * the transaction opens (it's the slow part), so the swap of old chunks for
 * new is a short write and a search never sees a half-indexed document.
 */
export async function writeDocument(doc: IndexableDocument, existingId?: string, precomputed?: number[][]): Promise<string> {
  const vectors = precomputed ?? (await embedDocuments(doc.chunks));
  const hash = contentHash(doc.title, doc.chunks);
  return db.transaction(async (tx) => {
    let id = existingId;
    const values = {
      sourceType: doc.sourceType,
      sourceId: doc.sourceId,
      brandId: doc.brandId,
      ledgerEntityId: doc.ledgerEntityId ?? null,
      title: doc.title.slice(0, 300),
      fileUrl: doc.fileUrl ?? null,
      contentType: doc.contentType ?? null,
      contentHash: hash,
      status: "ready" as const,
      error: null,
      chunkCount: doc.chunks.length,
      updatedAt: new Date(),
    };
    if (id) {
      await tx.update(kbDocuments).set(values).where(eq(kbDocuments.id, id));
      await tx.delete(kbChunks).where(eq(kbChunks.documentId, id));
    } else {
      const [row] = await tx
        .insert(kbDocuments)
        .values({ ...values, uploadedBy: doc.uploadedBy ?? null })
        .returning({ id: kbDocuments.id });
      id = row!.id;
    }
    if (doc.chunks.length > 0) {
      await tx.insert(kbChunks).values(
        doc.chunks.map((content, index) => ({
          documentId: id!,
          brandId: doc.brandId,
          sourceType: doc.sourceType,
          chunkIndex: index,
          content,
          embedding: vectors[index]!,
        })),
      );
    }
    return id!;
  });
}

/**
 * Many new single-chunk documents (mirrored records) in two statements —
 * one insert for the documents, one for their chunks. Indexing row by row
 * costs several round trips each, which against a remote database turned a
 * first sync of ~200 records into minutes.
 */
export async function insertSingleChunkDocuments(docs: (Omit<IndexableDocument, "chunks"> & { chunk: string; vector: number[] })[]): Promise<void> {
  if (docs.length === 0) return;
  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(kbDocuments)
      .values(
        docs.map((doc) => ({
          sourceType: doc.sourceType,
          sourceId: doc.sourceId,
          brandId: doc.brandId,
          ledgerEntityId: doc.ledgerEntityId ?? null,
          title: doc.title.slice(0, 300),
          contentHash: contentHash(doc.title, [doc.chunk]),
          chunkCount: 1,
        })),
      )
      .returning({ id: kbDocuments.id });
    await tx.insert(kbChunks).values(
      docs.map((doc, index) => ({
        documentId: inserted[index]!.id,
        brandId: doc.brandId,
        sourceType: doc.sourceType,
        chunkIndex: 0,
        content: doc.chunk,
        embedding: doc.vector,
      })),
    );
  });
}

/** Mirrored documents of these types whose source row is gone (deleted expense, removed supplier…). */
export async function deleteMissingRecords(sourceTypes: string[], keepIds: Set<string>): Promise<number> {
  if (sourceTypes.length === 0) return 0;
  const rows = await db
    .select({ id: kbDocuments.id, sourceId: kbDocuments.sourceId })
    .from(kbDocuments)
    .where(inArray(kbDocuments.sourceType, sourceTypes));
  const stale = rows.filter((row) => !row.sourceId || !keepIds.has(row.sourceId)).map((row) => row.id);
  for (let start = 0; start < stale.length; start += 500) {
    await db.delete(kbDocuments).where(inArray(kbDocuments.id, stale.slice(start, start + 500)));
  }
  return stale.length;
}

/** source_id → { id, hash } for the mirrored documents of these types — what records.ts compares against. */
export async function existingRecordHashes(sourceTypes: string[]): Promise<Map<string, { id: string; hash: string }>> {
  const rows = await db
    .select({ id: kbDocuments.id, sourceId: kbDocuments.sourceId, hash: kbDocuments.contentHash })
    .from(kbDocuments)
    .where(and(inArray(kbDocuments.sourceType, sourceTypes), sql`${kbDocuments.sourceId} is not null`));
  return new Map(rows.map((row) => [row.sourceId!, { id: row.id, hash: row.hash }]));
}
