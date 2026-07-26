import { integer, pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { productVariants } from "./catalog.js";
import { warehouseBins } from "./warehouse.js";

export const inventory = pgTable(
  "inventory",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    binId: uuid("bin_id")
      .notNull()
      .references(() => warehouseBins.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("inventory_variant_id_bin_id_key").on(table.variantId, table.binId)],
);
