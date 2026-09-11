import { char, date, index, numeric, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { brands } from "./brands.js";
import { users } from "./users.js";
import { revenueCategoryEnum } from "./enums.js";

/**
 * Hand-recorded revenue, brand-scoped — the Finance page's income ledger.
 * Sits alongside (not instead of) the revenue the system already derives
 * from orders.order_items.subtotal (see getFinanceSummary): this table is
 * for income that never became an Order row — a wholesale invoice, an
 * in-person/DM sale, etc.
 */
export const revenues = pgTable(
  "revenues",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    source: varchar("source", { length: 200 }).notNull(),
    category: revenueCategoryEnum("category").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: char("currency", { length: 3 }).notNull().default("EGP"),
    /** A calendar day, not an instant — same reasoning as expenses.expense_date. */
    revenueDate: date("revenue_date").notNull(),
    notes: text("notes"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("ix_revenues_brand_date").on(table.brandId, table.revenueDate)],
);
