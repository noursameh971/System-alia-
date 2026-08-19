import { char, numeric, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { productVariants } from "./catalog.js";
import { users } from "./users.js";

export const variantPrices = pgTable(
  "variant_prices",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    price: numeric("price", { precision: 10, scale: 2 }).notNull(),
    currency: char("currency", { length: 3 }).notNull().default("EGP"),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Only one active (effective_to IS NULL) price per variant — mirrors
    // uq_variant_prices_active in database/schema.sql
    uniqueIndex("uq_variant_prices_active")
      .on(table.variantId)
      .where(sql`${table.effectiveTo} IS NULL`),
  ],
);

// Production/unit cost per variant — same history-tracked shape as
// variantPrices above (only one effective_to IS NULL row per variant at a
// time), kept as a separate table rather than a column so cost changes
// don't clobber the price history and vice versa. See
// database/migrations/0008_add_production_cost.sql.
export const variantCosts = pgTable(
  "variant_costs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    cost: numeric("cost", { precision: 10, scale: 2 }).notNull(),
    currency: char("currency", { length: 3 }).notNull().default("EGP"),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_variant_costs_active")
      .on(table.variantId)
      .where(sql`${table.effectiveTo} IS NULL`),
  ],
);
