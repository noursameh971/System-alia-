import { date, numeric, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { brands } from "./brands.js";
import { users } from "./users.js";

/**
 * Optional per-brand starting position for the Balance Sheet — one row per
 * brand, absent until someone fills in "Starting Cash & Capital" on the
 * Finance page. See database/migrations/0032_add_brand_opening_balances.sql.
 */
export const brandOpeningBalances = pgTable("brand_opening_balances", {
  brandId: uuid("brand_id")
    .primaryKey()
    .references(() => brands.id, { onDelete: "cascade" }),
  startingCash: numeric("starting_cash", { precision: 14, scale: 2 }).notNull().default("0"),
  ownerCapital: numeric("owner_capital", { precision: 14, scale: 2 }).notNull().default("0"),
  /** The day startingCash was true; flows on or after it are added on top. Null = before the first record. */
  asOfDate: date("as_of_date"),
  updatedBy: uuid("updated_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
