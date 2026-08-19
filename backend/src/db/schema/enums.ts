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
export const orderPaymentMethodEnum = pgEnum("order_payment_method", ["cod", "online"]);
export const returnDispositionEnum = pgEnum("return_disposition", ["restock", "write_off"]);

// Fashion-brand expense buckets — a fixed enum, not free text, so the
// Finance page's breakdown chart can't be fragmented by typos.
export const expenseCategoryEnum = pgEnum("expense_category", [
  "marketing",
  "salaries",
  "production",
  "packaging",
  "rent",
  "misc",
]);

// Distinct from orderPaymentMethodEnum: how a customer pays for an order and
// how the business settles a bill are different domains.
export const expensePaymentMethodEnum = pgEnum("expense_payment_method", [
  "cash",
  "bank_transfer",
  "card",
  "instapay",
  "other",
]);

// Suppliers & Debts Ledger — see database/migrations/0011_add_ledger.sql.
export const ledgerEntityCategoryEnum = pgEnum("ledger_entity_category", [
  "fabric",
  "stitching",
  "packaging",
  "courier",
  "other",
]);

// payable: we owe this entity. receivable: this entity owes us.
export const ledgerBalanceTypeEnum = pgEnum("ledger_balance_type", ["payable", "receivable"]);

export const ledgerTransactionKindEnum = pgEnum("ledger_transaction_kind", [
  "opening_balance",
  "charge",
  "payment",
]);
