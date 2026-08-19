import { boolean, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const brands = pgTable("brands", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 100 }).notNull().unique(),
  code: varchar("code", { length: 10 }).notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  /** Settings page's "Brand Profile" tab — nullable, same "no placeholder needed" convention as products.imageUrl. */
  logoUrl: text("logo_url"),
  /** Printed at the top of OrderReceipt below the brand name — e.g. return policy, tax number. */
  receiptNotes: text("receipt_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
