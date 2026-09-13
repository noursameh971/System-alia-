import { char, date, index, numeric, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { brands } from "./brands.js";
import { users } from "./users.js";
import { ledgerEntities, ledgerTransactions } from "./ledger.js";
import { expenseCategoryEnum, expensePaymentMethodEnum } from "./enums.js";

/**
 * Hand-recorded operating expenses, brand-scoped — the Finance page's
 * ledger. Deliberately NOT where COGS or shipping live: those are derived
 * from order_items.cost_at_sale and orders.shipping_fee, so recording them
 * here too would double-count them in Total Expenses.
 */
export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 200 }).notNull(),
    category: expenseCategoryEnum("category").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: char("currency", { length: 3 }).notNull().default("EGP"),
    paymentMethod: expensePaymentMethodEnum("payment_method").notNull().default("cash"),
    /** A calendar day, not an instant — see the migration for why this isn't TIMESTAMPTZ. */
    expenseDate: date("expense_date").notNull(),
    receiptUrl: text("receipt_url"),
    notes: text("notes"),
    /**
     * Optional: this expense also represents a payment toward a supplier's
     * payable balance. ledgerTransactionId is the ledger_transactions row
     * (kind: "payment") this expense created — kept in sync on edit/delete
     * rather than left to drift, see expenses.service.ts.
     */
    ledgerEntityId: uuid("ledger_entity_id").references(() => ledgerEntities.id, { onDelete: "set null" }),
    ledgerTransactionId: uuid("ledger_transaction_id").references(() => ledgerTransactions.id, { onDelete: "set null" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("ix_expenses_brand_date").on(table.brandId, table.expenseDate),
    index("ix_expenses_ledger_entity").on(table.ledgerEntityId),
  ],
);
