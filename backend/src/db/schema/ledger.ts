import { date, index, numeric, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { brands } from "./brands.js";
import { users } from "./users.js";
import { ledgerBalanceTypeEnum, ledgerEntityCategoryEnum, ledgerTransactionKindEnum } from "./enums.js";

/**
 * A named counterparty (supplier, factory, courier, client) the brand owes
 * money to or is owed money by. The case-insensitive uniqueness on
 * (brand_id, name) is enforced by a raw expression index in the migration —
 * Drizzle only uses this file for typed query building here (migrations are
 * hand-authored SQL, not generated), so it's declared below as a plain
 * index for documentation/typing rather than duplicating the expression.
 */
export const ledgerEntities = pgTable(
  "ledger_entities",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    category: ledgerEntityCategoryEnum("category").notNull().default("other"),
    balanceType: ledgerBalanceTypeEnum("balance_type").notNull(),
    notes: text("notes"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("ix_ledger_entities_brand_name").on(table.brandId, table.name)],
);

/**
 * One row per opening balance, charge, or payment against an entity.
 * Total Billed = sum(opening_balance) + sum(charge); Amount Paid =
 * sum(payment); Remaining Balance = Total Billed - Amount Paid — computed
 * in ledger.service.ts, never stored, so it can't drift from its inputs.
 */
export const ledgerTransactions = pgTable(
  "ledger_transactions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => ledgerEntities.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    kind: ledgerTransactionKindEnum("kind").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    transactionDate: date("transaction_date").notNull(),
    dueDate: date("due_date"),
    notes: text("notes"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("ix_ledger_transactions_entity").on(table.entityId, table.transactionDate),
    index("ix_ledger_transactions_brand").on(table.brandId),
  ],
);
