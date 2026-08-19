import { check, integer, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { productVariants } from "./catalog.js";
import { movementTypeEnum, reasonScopeEnum } from "./enums.js";
import { users } from "./users.js";
import { warehouseBins } from "./warehouse.js";

export const reasonCodes = pgTable("reason_codes", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 30 }).notNull().unique(),
  label: varchar("label", { length: 100 }).notNull(),
  appliesTo: reasonScopeEnum("applies_to").notNull().default("both"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "restrict" }),
    movementType: movementTypeEnum("movement_type").notNull(),
    quantity: integer("quantity").notNull(),
    fromBinId: uuid("from_bin_id").references(() => warehouseBins.id, { onDelete: "restrict" }),
    toBinId: uuid("to_bin_id").references(() => warehouseBins.id, { onDelete: "restrict" }),
    reasonCodeId: uuid("reason_code_id").references(() => reasonCodes.id, { onDelete: "restrict" }),
    referenceType: varchar("reference_type", { length: 30 }),
    referenceId: uuid("reference_id"),
    performedBy: uuid("performed_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Mirrors chk_movement_bins in database/schema.sql — kept here for
    // type-level documentation; the raw SQL migration is the enforced source.
    check(
      "chk_movement_bins",
      sql`
        (${table.movementType} = 'inbound'   AND ${table.fromBinId} IS NULL     AND ${table.toBinId} IS NOT NULL) OR
        (${table.movementType} = 'outbound'  AND ${table.fromBinId} IS NOT NULL AND ${table.toBinId} IS NULL) OR
        (${table.movementType} = 'transfer'  AND ${table.fromBinId} IS NOT NULL AND ${table.toBinId} IS NOT NULL) OR
        (${table.movementType} = 'return_in' AND ${table.fromBinId} IS NULL) OR
        (${table.movementType} = 'adjustment')
      `,
    ),
  ],
);
