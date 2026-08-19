import { char, integer, numeric, pgTable, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { brands } from "./brands.js";

/**
 * Single-row global settings — General & Localization + Inventory &
 * Operations tabs of the Settings page. Enforced as a singleton by
 * application logic (settings.service.ts always reads/writes the one row
 * created by the 0009 migration), not a DB constraint, since Postgres has
 * no clean "at most one row" check without a dummy always-true unique column.
 */
export const appSettings = pgTable("app_settings", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  lowStockThreshold: integer("low_stock_threshold").notNull().default(5),
  defaultCurrency: char("default_currency", { length: 3 }).notNull().default("EGP"),
  dateFormat: varchar("date_format", { length: 20 }).notNull().default("DD/MM/YYYY"),
  defaultLanguage: varchar("default_language", { length: 5 }).notNull().default("en"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Default shipping fee per (brand, city) — the Inventory & Operations tab's "Default Shipping Rates per city" list. */
export const shippingRates = pgTable(
  "shipping_rates",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    city: varchar("city", { length: 100 }).notNull(),
    rate: numeric("rate", { precision: 10, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("uq_shipping_rates_brand_city").on(table.brandId, table.city)],
);
