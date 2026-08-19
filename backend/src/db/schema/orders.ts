import { check, integer, numeric, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { brands } from "./brands.js";
import { productVariants } from "./catalog.js";
import { orderPaymentMethodEnum, orderStatusEnum } from "./enums.js";
import { users } from "./users.js";

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: uuid("brand_id")
    .notNull()
    .references(() => brands.id, { onDelete: "restrict" }),
  orderNumber: varchar("order_number", { length: 50 }).notNull().unique(),
  customerName: varchar("customer_name", { length: 150 }),
  customerPhone: varchar("customer_phone", { length: 30 }),
  customerAddress: text("customer_address"),
  status: orderStatusEnum("status").notNull().default("pending"),
  paymentMethod: orderPaymentMethodEnum("payment_method").notNull().default("cod"),
  shippingFee: numeric("shipping_fee", { precision: 10, scale: 2 }).notNull().default("0"),
  orderDate: timestamp("order_date", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    unitPriceAtSale: numeric("unit_price_at_sale", { precision: 10, scale: 2 }).notNull(),
    /** Snapshot of the variant's production cost at sale time — 0 for items sold before cost tracking existed, or for variants with no cost set. */
    costAtSale: numeric("cost_at_sale", { precision: 10, scale: 2 }).notNull().default("0"),
    subtotal: numeric("subtotal", { precision: 12, scale: 2 }).generatedAlwaysAs(
      (): ReturnType<typeof sql> => sql`quantity * unit_price_at_sale`,
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check("chk_order_items_quantity_positive", sql`${table.quantity} > 0`)],
);
