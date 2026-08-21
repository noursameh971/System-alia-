import { eq, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { appSettings, expenses, inventory, ledgerTransactions, orders, returns, stockMovements } from "../../db/schema/index.js";
import type { UpdateSettingsInput } from "./settings.schema.js";

export interface AppSettingsResult {
  lowStockThreshold: number;
  defaultCurrency: string;
  dateFormat: string;
  defaultLanguage: string;
}

/**
 * Always operates on the single row seeded by migration 0009 — get-or-create
 * defensively (rather than assuming a fixed id) in case that row is ever
 * missing, e.g. a database restored from a pre-0009 backup.
 */
async function getSettingsRow() {
  const [row] = await db.select().from(appSettings).limit(1);
  if (row) return row;
  const [created] = await db.insert(appSettings).values({}).returning();
  return created!;
}

export async function getSettings(): Promise<AppSettingsResult> {
  const row = await getSettingsRow();
  return {
    lowStockThreshold: row.lowStockThreshold,
    defaultCurrency: row.defaultCurrency,
    dateFormat: row.dateFormat,
    defaultLanguage: row.defaultLanguage,
  };
}

export async function updateSettings(input: UpdateSettingsInput): Promise<AppSettingsResult> {
  const row = await getSettingsRow();
  const [updated] = await db
    .update(appSettings)
    .set({ ...input, updatedAt: sql`now()` })
    .where(eq(appSettings.id, row.id))
    .returning();
  return {
    lowStockThreshold: updated!.lowStockThreshold,
    defaultCurrency: updated!.defaultCurrency,
    dateFormat: updated!.dateFormat,
    defaultLanguage: updated!.defaultLanguage,
  };
}

/**
 * Settings > Danger Zone — wipes every brand's operational history (orders,
 * returns, stock movements, live bin quantities, expenses, ledger
 * transactions) while leaving the catalog, brands, users, and settings
 * untouched, so the system is immediately usable again afterward instead of
 * needing to be reconfigured from scratch.
 *
 * Deletion order respects the schema's ON DELETE RESTRICT edges (returns ->
 * orders/order_items would otherwise block the orders delete); order_items
 * cascades automatically. ledger_entities (the supplier/courier directory)
 * is deliberately kept — only its transactions are transactional data.
 * Inventory rows are zeroed rather than deleted so existing (variant, bin)
 * pairings don't need to be recreated on the next stock movement.
 */
export async function resetTransactionalData(): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(returns);
    await tx.delete(orders); // cascades order_items
    await tx.delete(stockMovements);
    await tx.update(inventory).set({ quantity: 0, updatedAt: sql`now()` });
    await tx.delete(expenses);
    await tx.delete(ledgerTransactions);
  });
}
