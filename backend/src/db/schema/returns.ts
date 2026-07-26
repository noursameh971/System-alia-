import { check, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { productVariants } from "./catalog.js";
import { returnDispositionEnum } from "./enums.js";
import { orderItems, orders } from "./orders.js";
import { reasonCodes } from "./stockMovements.js";
import { users } from "./users.js";
import { warehouseBins } from "./warehouse.js";

export const returns = pgTable(
  "returns",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    orderItemId: uuid("order_item_id")
      .notNull()
      .references(() => orderItems.id, { onDelete: "restrict" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    reasonCodeId: uuid("reason_code_id")
      .notNull()
      .references(() => reasonCodes.id, { onDelete: "restrict" }),
    disposition: returnDispositionEnum("disposition").notNull(),
    restockBinId: uuid("restock_bin_id").references(() => warehouseBins.id, { onDelete: "restrict" }),
    processedBy: uuid("processed_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "chk_restock_bin_required",
      sql`
        (${table.disposition} = 'restock' AND ${table.restockBinId} IS NOT NULL) OR
        (${table.disposition} = 'write_off' AND ${table.restockBinId} IS NULL)
      `,
    ),
  ],
);
