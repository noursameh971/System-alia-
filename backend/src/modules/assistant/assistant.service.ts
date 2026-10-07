import { and, asc, desc, eq } from "drizzle-orm";
import { env } from "../../config/env.js";
import { db } from "../../db/client.js";
import { aiActions, aiConversations, aiMessages } from "../../db/schema/index.js";
import { ApiError } from "../../utils/apiError.js";
import { isAssistantEnabled } from "./assistant.client.js";

export interface AssistantStatus {
  enabled: boolean;
  model: string;
}

export function getAssistantStatus(): AssistantStatus {
  return { enabled: isAssistantEnabled(), model: env.ASSISTANT_MODEL };
}

export interface ConversationSummary {
  id: string;
  brandId: string | null;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type AiActionStatus = (typeof aiActions.$inferSelect)["status"];

export interface ConversationAction {
  id: string;
  toolUseId: string | null;
  toolName: string;
  brandId: string;
  payload: Record<string, unknown>;
  assumedFields: string[];
  /** "proposed" past its expires_at reads as "expired", whether or not a sweep has updated the row yet. */
  status: AiActionStatus;
  resultTable: string | null;
  resultId: string | null;
  error: string | null;
  expiresAt: Date;
  createdAt: Date;
}

export interface ConversationDetail extends ConversationSummary {
  messages: (typeof aiMessages.$inferSelect)[];
  actions: ConversationAction[];
}

const HISTORY_LIMIT = 50;

/** Conversations are private to the admin who started them — every query here is keyed on userId as well as id. */
export async function listConversations(userId: string): Promise<ConversationSummary[]> {
  return db
    .select({
      id: aiConversations.id,
      brandId: aiConversations.brandId,
      title: aiConversations.title,
      createdAt: aiConversations.createdAt,
      updatedAt: aiConversations.updatedAt,
    })
    .from(aiConversations)
    .where(eq(aiConversations.userId, userId))
    .orderBy(desc(aiConversations.updatedAt))
    .limit(HISTORY_LIMIT);
}

export async function getConversation(id: string, userId: string): Promise<ConversationDetail> {
  const [conversation] = await db
    .select({
      id: aiConversations.id,
      brandId: aiConversations.brandId,
      title: aiConversations.title,
      createdAt: aiConversations.createdAt,
      updatedAt: aiConversations.updatedAt,
    })
    .from(aiConversations)
    .where(and(eq(aiConversations.id, id), eq(aiConversations.userId, userId)))
    .limit(1);

  // Another admin's conversation is reported as missing, not forbidden — no
  // need to confirm it exists.
  if (!conversation) throw ApiError.notFound("Conversation not found");

  const [messages, actionRows] = await Promise.all([
    db.select().from(aiMessages).where(eq(aiMessages.conversationId, id)).orderBy(asc(aiMessages.createdAt)),
    db.select().from(aiActions).where(eq(aiActions.conversationId, id)).orderBy(asc(aiActions.createdAt)),
  ]);

  const now = Date.now();
  const actions = actionRows.map((row) => ({
    id: row.id,
    toolUseId: row.toolUseId,
    toolName: row.toolName,
    brandId: row.brandId,
    payload: row.payload,
    assumedFields: row.assumedFields,
    status: row.status === "proposed" && row.expiresAt.getTime() <= now ? ("expired" as const) : row.status,
    resultTable: row.resultTable,
    resultId: row.resultId,
    error: row.error,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  }));

  return { ...conversation, messages, actions };
}

export async function deleteConversation(id: string, userId: string): Promise<void> {
  // Cascades to ai_messages and ai_actions. Records an executed action
  // already wrote (expenses, revenues) are ordinary rows and stay.
  const deleted = await db
    .delete(aiConversations)
    .where(and(eq(aiConversations.id, id), eq(aiConversations.userId, userId)))
    .returning({ id: aiConversations.id });
  if (deleted.length === 0) throw ApiError.notFound("Conversation not found");
}
