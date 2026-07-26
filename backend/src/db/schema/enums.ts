import { pgEnum } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["admin", "warehouse_staff"]);
export const productStatusEnum = pgEnum("product_status", ["active", "draft", "discontinued"]);
export const variantStatusEnum = pgEnum("variant_status", ["active", "discontinued"]);
export const movementTypeEnum = pgEnum("movement_type", [
  "inbound",
  "outbound",
  "transfer",
  "return_in",
  "adjustment",
]);
export const reasonScopeEnum = pgEnum("reason_scope", ["stock_movement", "return", "both"]);
export const orderStatusEnum = pgEnum("order_status", [
  "pending",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
]);
export const returnDispositionEnum = pgEnum("return_disposition", ["restock", "write_off"]);
