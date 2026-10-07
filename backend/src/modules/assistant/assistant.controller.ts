import type { Request, Response } from "express";
import { ApiError } from "../../utils/apiError.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { confirmAction, rejectAction } from "./actions.service.js";
import { checkModelConnection } from "./assistant.client.js";
import { deleteConversation, getAssistantStatus, getConversation, listConversations } from "./assistant.service.js";
import {
  actionIdParamSchema,
  conversationIdParamSchema,
  statusQuerySchema,
  type ChatBody,
} from "./assistant.schema.js";
import { runChatTurn, type ChatStreamEvent } from "./chat.service.js";

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
    sendSuccess(res, 200, { ...status, connection: await checkModelConnection() });
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

function parseActionId(req: Request): string {
  const parsed = actionIdParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.notFound("Action not found");
  return parsed.data.id;
}

export async function chatHandler(req: Request, res: Response): Promise<void> {
  const body = req.body as ChatBody;
  sendSuccess(res, 200, await runChatTurn({ userId: req.user!.id, ...body }));
}

export async function confirmActionHandler(req: Request, res: Response): Promise<void> {
  const overrides = (req.body as { overrides?: Record<string, unknown> } | undefined)?.overrides;
  sendSuccess(res, 200, await confirmAction(parseActionId(req), req.user!.id, overrides));
}

export async function rejectActionHandler(req: Request, res: Response): Promise<void> {
  sendSuccess(res, 200, await rejectAction(parseActionId(req), req.user!.id));
}

/**
 * Same turn as chatHandler, delivered as server-sent events (see
 * ChatStreamEvent) so the reply appears as it's written. The stream opens
 * on the first event, which runChatTurn sends only after its access and
 * in-flight checks — so a 404/409 still arrives as an ordinary JSON error.
 * Once open, a failure becomes an `error` event instead.
 */
export async function chatStreamHandler(req: Request, res: Response): Promise<void> {
  const body = req.body as ChatBody;
  const abort = new AbortController();
  // The admin closed the panel or lost the connection: stop the Claude
  // request instead of paying for a reply nobody will read.
  res.on("close", () => {
    if (!res.writableEnded) abort.abort();
  });

  let open = false;
  const send = (event: ChatStreamEvent) => {
    if (res.destroyed) return;
    if (!open) {
      res.status(200);
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();
      open = true;
    }
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    const result = await runChatTurn({ userId: req.user!.id, ...body }, { onEvent: send, signal: abort.signal });
    send({ type: "done", result });
  } catch (err) {
    if (!open) throw err;
    if (!(err instanceof ApiError)) console.error("Assistant stream failed:", err);
    send({
      type: "error",
      message: err instanceof ApiError ? err.message : "Internal server error",
      status: err instanceof ApiError ? err.statusCode : 500,
    });
  } finally {
    if (open && !res.writableEnded) res.end();
  }
}
