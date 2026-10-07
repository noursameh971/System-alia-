import { index, integer, jsonb, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type Anthropic from "@anthropic-ai/sdk";
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
    role: varchar("role", { length: 16 }).$type<"user" | "assistant">().notNull(),
    /** Content blocks exactly as exchanged with the Claude API — replayed verbatim on the next turn. */
    content: jsonb("content").$type<Anthropic.Beta.Messages.BetaMessageParam["content"]>().notNull(),
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
