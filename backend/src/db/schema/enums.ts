import { pgEnum } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["admin", "warehouse_staff", "finance"]);
export const productStatusEnum = pgEnum("product_status", ["active", "draft", "discontinued"]);
export const variantStatusEnum = pgEnum("variant_status", ["active", "discontinued"]);
export const movementTypeEnum = pgEnum("movement_type", [
  "inbound",
  "outbound",
  "transfer",
  "return_in",
  "adjustment",
  "gift",
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

// Hand-recorded income buckets — for revenue that never became an Order row
// (a wholesale invoice, an in-person sale, recovered shipping, etc.). A
// fixed enum for the same reason as expense_category: free text would let
// typos fragment a reporting bucket.
export const revenueCategoryEnum = pgEnum("revenue_category", [
  "product_sales",
  "wholesale",
  "shipping_income",
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

// --- Factory & Manufacturing module (standalone from the retail brands) ---
// See database/migrations/0020_add_factory_module.sql.

export const workOrderStatusEnum = pgEnum("work_order_status", [
  "draft",
  "scheduled",
  "in_progress",
  "paused",
  "completed",
  "cancelled",
]);

export const workOrderPriorityEnum = pgEnum("work_order_priority", ["low", "normal", "high", "urgent"]);

export const stageStatusEnum = pgEnum("stage_status", ["pending", "in_progress", "completed", "skipped"]);

export const machineStatusEnum = pgEnum("machine_status", ["idle", "running", "maintenance", "down"]);

// receipt: new material bought in. issue: consumed against a work order.
// return: unused issued material sent back to store. adjustment: manual
// correction (stock count, damage). waste: scrapped during handling/storage
// (as opposed to scrap during production, which is production_output_logs).
export const materialMovementTypeEnum = pgEnum("material_movement_type", [
  "receipt",
  "issue",
  "return",
  "adjustment",
  "waste",
]);

// production_receipt: a completed work order's output entering stock.
// shipment_out: finished goods leaving the factory (e.g. to a brand).
export const finishedGoodsMovementTypeEnum = pgEnum("finished_goods_movement_type", [
  "production_receipt",
  "shipment_out",
  "adjustment",
]);

export const qualityResultEnum = pgEnum("quality_result", ["pass", "fail", "rework"]);
