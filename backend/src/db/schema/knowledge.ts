import { char, index, integer, pgTable, text, timestamp, uuid, varchar, vector } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { brands } from "./brands.js";
import { ledgerEntities } from "./ledger.js";
import { users } from "./users.js";

/**
 * The assistant's knowledge base — see database/migrations/0028_add_knowledge_base.sql.
 * Migrations are hand-authored SQL; this file is for typed query building
 * only. kb_chunks.tsv (a generated column) is left out: it's only ever read
 * in raw SQL, in knowledge/search.service.ts.
 */
export const kbDocuments = pgTable(
  "kb_documents",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    sourceType: varchar("source_type", { length: 32 }).notNull(),
    sourceId: uuid("source_id"),
    brandId: uuid("brand_id").references(() => brands.id, { onDelete: "cascade" }),
    ledgerEntityId: uuid("ledger_entity_id").references(() => ledgerEntities.id, { onDelete: "set null" }),
    title: varchar("title", { length: 300 }).notNull(),
    fileUrl: text("file_url"),
    contentType: varchar("content_type", { length: 100 }),
    contentHash: char("content_hash", { length: 64 }).notNull(),
    status: varchar("status", { length: 16 }).$type<"ready" | "failed">().notNull().default("ready"),
    error: text("error"),
    chunkCount: integer("chunk_count").notNull().default(0),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("ix_kb_documents_brand").on(table.brandId)],
);

export const kbChunks = pgTable(
  "kb_chunks",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    documentId: uuid("document_id")
      .notNull()
      .references(() => kbDocuments.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id").references(() => brands.id, { onDelete: "cascade" }),
    sourceType: varchar("source_type", { length: 32 }).notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 384 }).notNull(),
  },
  (table) => [index("ix_kb_chunks_brand").on(table.brandId)],
);
