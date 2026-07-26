import { pgTable, text, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const warehouses = pgTable("warehouses", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 100 }).notNull(),
  address: text("address"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const warehouseZones = pgTable(
  "warehouse_zones",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    warehouseId: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 20 }).notNull(),
    name: varchar("name", { length: 100 }),
  },
  (table) => [unique("warehouse_zones_warehouse_id_code_key").on(table.warehouseId, table.code)],
);

export const warehouseBins = pgTable(
  "warehouse_bins",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    zoneId: uuid("zone_id")
      .notNull()
      .references(() => warehouseZones.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 20 }).notNull(),
  },
  (table) => [unique("warehouse_bins_zone_id_code_key").on(table.zoneId, table.code)],
);
