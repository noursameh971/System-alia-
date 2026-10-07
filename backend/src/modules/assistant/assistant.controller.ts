import type { Request, Response } from "express";
import { ApiError } from "../../utils/apiError.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { checkAnthropicConnection } from "./assistant.client.js";
import { deleteConversation, getAssistantStatus, getConversation, listConversations } from "./assistant.service.js";
import { conversationIdParamSchema, statusQuerySchema } from "./assistant.schema.js";

/** A malformed id can't match any row, so it's a 404 like any other miss — not a Postgres uuid-cast error. */
function parseConversationId(req: Request): string {
  const parsed = conversationIdParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.notFound("Conversation not found");
  return parsed.data.id;
}

export async function getStatusHandler(req: Request, res: Response): Promise<void> {
  const parsed = statusQuerySchema.safeParse(req.query);
  if (!parsed.success) throw ApiError.badRequest("Invalid query parameters", parsed.error.flatten());

  const status = getAssistantStatus();
  if (parsed.data.verify === "true" && status.enabled) {
    sendSuccess(res, 200, { ...status, connection: await checkAnthropicConnection() });
    return;
  }
  sendSuccess(res, 200, status);
}

export async function listConversationsHandler(req: Request, res: Response): Promise<void> {
  sendSuccess(res, 200, await listConversations(req.user!.id));
}

export async function getConversationHandler(req: Request, res: Response): Promise<void> {
  sendSuccess(res, 200, await getConversation(parseConversationId(req), req.user!.id));
}

export async function deleteConversationHandler(req: Request, res: Response): Promise<void> {
  await deleteConversation(parseConversationId(req), req.user!.id);
  sendSuccess(res, 200, { deleted: true });
}
