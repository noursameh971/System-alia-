import { char, index, integer, jsonb, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { brands } from "./brands.js";
import { users } from "./users.js";
import { aiActionStatusEnum } from "./enums.js";

/**
 * Admin AI assistant — see database/migrations/0024_add_ai_assistant.sql
 * for the column-by-column reasoning. Migrations are hand-authored SQL;
 * this file is for typed query building only.
 */
export const aiConversations = pgTable(
  "ai_conversations",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id").references(() => brands.id, { onDelete: "set null" }),
    title: varchar("title", { length: 200 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("ix_ai_conversations_user").on(table.userId, table.updatedAt)],
);

export const aiMessages = pgTable(
  "ai_messages",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => aiConversations.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 16 }).$type<"user" | "assistant" | "tool">().notNull(),
    /** The full chat-completions message (see history.ts), replayed verbatim on the next turn. Older rows hold Anthropic content blocks. */
    content: jsonb("content").$type<unknown>().notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("ix_ai_messages_conversation").on(table.conversationId, table.createdAt)],
);

export const aiActions = pgTable(
  "ai_actions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => aiConversations.id, { onDelete: "cascade" }),
    toolUseId: varchar("tool_use_id", { length: 64 }),
    toolName: varchar("tool_name", { length: 64 }).notNull(),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    /** The already-validated service input — exactly what Confirm will write. */
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    /** Payload fields the model defaulted rather than took from the admin — highlighted on the card. See 0025. */
    assumedFields: text("assumed_fields").array().notNull().default(sql`'{}'::text[]`),
    /** The receipt this draft was made from, if any. See 0027. */
    attachmentId: uuid("attachment_id").references(() => aiAttachments.id, { onDelete: "set null" }),
    /** Card-only facts beyond the payload — e.g. the linked supplier's name. The shownOnCard values the model was given. */
    display: jsonb("display").$type<Record<string, string>>().notNull().default(sql`'{}'::jsonb`),
    status: aiActionStatusEnum("status").notNull().default("proposed"),
    resultTable: varchar("result_table", { length: 64 }),
    resultId: uuid("result_id"),
    error: text("error"),
    proposedBy: uuid("proposed_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "restrict" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    executedAt: timestamp("executed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true })
      .notNull()
      .default(sql`now() + interval '24 hours'`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("ix_ai_actions_conversation").on(table.conversationId, table.createdAt)],
);

/** A receipt or invoice attached in the assistant panel — see database/migrations/0027_add_ai_attachments.sql. */
export const aiAttachments = pgTable(
  "ai_attachments",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    uploadedBy: uuid("uploaded_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    conversationId: uuid("conversation_id").references(() => aiConversations.id, { onDelete: "set null" }),
    messageId: uuid("message_id").references(() => aiMessages.id, { onDelete: "set null" }),
    fileUrl: text("file_url").notNull(),
    fileName: varchar("file_name", { length: 255 }),
    contentType: varchar("content_type", { length: 100 }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: char("sha256", { length: 64 }).notNull(),
    /** receiptReader.ts's ReceiptExtraction, or null when reading failed. */
    extraction: jsonb("extraction").$type<Record<string, unknown>>(),
    extractionStatus: varchar("extraction_status", { length: 16 }).$type<"done" | "failed">().notNull(),
    extractionError: text("extraction_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("ix_ai_attachments_sha256").on(table.sha256), index("ix_ai_attachments_conversation").on(table.conversationId)],
);
