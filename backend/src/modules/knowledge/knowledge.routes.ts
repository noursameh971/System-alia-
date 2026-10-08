import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { rawBody } from "../../middleware/rawBody.js";
import { ApiError } from "../../utils/apiError.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { deleteKnowledgeDocument, getKnowledgeStatus, listKnowledgeDocuments, uploadKnowledgeDocument } from "./documents.service.js";
import { syncRecords } from "./records.js";
import { searchKnowledge } from "./search.service.js";

/**
 * The knowledge base's admin API, mounted at /api/assistant/knowledge —
 * inside the assistant router, so it inherits its admin-only guard.
 */
export const knowledgeRouter = Router();

function assertEnabled(): void {
  if (!env.KNOWLEDGE_ENABLED) throw ApiError.serviceUnavailable("The knowledge base is turned off on this server (KNOWLEDGE_ENABLED=false)");
}

const uuidHeader = z.string().uuid().optional();
const idParam = z.object({ id: z.string().uuid() });
const searchQuery = z.object({
  q: z.string().trim().min(1).max(500),
  brandId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(20).optional(),
});

function header(req: Request, name: string): string | undefined {
  const value = req.headers[name];
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    return decodeURIComponent(value.trim());
  } catch {
    return value.trim();
  }
}

knowledgeRouter.get(
  "/status",
  asyncHandler(async (_req: Request, res: Response) => {
    sendSuccess(res, 200, await getKnowledgeStatus(env.KNOWLEDGE_ENABLED));
  }),
);

knowledgeRouter.get(
  "/documents",
  asyncHandler(async (_req: Request, res: Response) => {
    sendSuccess(res, 200, await listKnowledgeDocuments());
  }),
);

// The file's raw bytes (Content-Type says which kind). Optional tags travel
// as headers so the body stays the file: X-File-Name, X-Title, X-Brand-Id,
// X-Ledger-Entity-Id (URI-encoded where they can hold non-ASCII text).
knowledgeRouter.post(
  "/documents",
  rawBody("8mb"),
  asyncHandler(async (req: Request, res: Response) => {
    assertEnabled();
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw ApiError.badRequest("Request body must be the raw file bytes");
    const brandId = uuidHeader.safeParse(header(req, "x-brand-id"));
    const ledgerEntityId = uuidHeader.safeParse(header(req, "x-ledger-entity-id"));
    if (!brandId.success || !ledgerEntityId.success) throw ApiError.badRequest("Invalid workspace or supplier id");
    const document = await uploadKnowledgeDocument({
      bytes: req.body,
      contentType: req.headers["content-type"] ?? "",
      fileName: header(req, "x-file-name") ?? "document",
      title: header(req, "x-title"),
      brandId: brandId.data ?? null,
      ledgerEntityId: ledgerEntityId.data ?? null,
      userId: req.user!.id,
    });
    sendSuccess(res, 201, document);
  }),
);

knowledgeRouter.delete(
  "/documents/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = idParam.safeParse(req.params);
    if (!parsed.success) throw ApiError.notFound("Document not found");
    await deleteKnowledgeDocument(parsed.data.id);
    sendSuccess(res, 200, { deleted: true });
  }),
);

/** Re-reads every mirrored record now (normally that happens every few minutes). */
knowledgeRouter.post(
  "/reindex",
  asyncHandler(async (_req: Request, res: Response) => {
    assertEnabled();
    sendSuccess(res, 200, await syncRecords());
  }),
);

/** What search_knowledge would return — for checking why the assistant did or didn't find something. */
knowledgeRouter.get(
  "/search",
  asyncHandler(async (req: Request, res: Response) => {
    assertEnabled();
    const parsed = searchQuery.safeParse(req.query);
    if (!parsed.success) throw ApiError.badRequest("Invalid query parameters", parsed.error.flatten());
    sendSuccess(res, 200, await searchKnowledge(parsed.data.q, { brandId: parsed.data.brandId, limit: parsed.data.limit }));
  }),
);
