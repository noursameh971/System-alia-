import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { ledgerEntities, ledgerTransactions } from "../../db/schema/index.js";
import { ApiError } from "../../utils/apiError.js";
import { getFinanceSummary } from "../expenses/expenses.service.js";
import type {
  CreateOpeningBalanceInput,
  LedgerBalanceType,
  LedgerEntityCategory,
  RecordPaymentInput,
} from "./ledger.schema.js";

export interface LedgerEntityWithBalance {
  id: string;
  brandId: string;
  name: string;
  category: LedgerEntityCategory;
  balanceType: LedgerBalanceType;
  notes: string | null;
  /** sum(opening_balance) + sum(charge). */
  totalBilled: number;
  /** sum(payment). */
  amountPaid: number;
  /** totalBilled - amountPaid. Can go negative — that's a credit/overpayment, shown as such rather than clamped. */
  remainingBalance: number;
  createdAt: string;
}

/** Used by requireBrandAccess-style checks on :id routes, where the brand isn't in the URL — same pattern as expenses.getExpenseBrandId. */
export async function getEntityBrandId(id: string): Promise<string> {
  const [row] = await db.select({ brandId: ledgerEntities.brandId }).from(ledgerEntities).where(eq(ledgerEntities.id, id)).limit(1);
  if (!row) throw ApiError.notFound("Ledger entity not found");
  return row.brandId;
}

/**
 * Get-or-create by (brandId, name) case-insensitively — the DB's unique
 * index is the actual enforcement; this just does the SELECT-then-INSERT
 * and turns the constraint violation into a normal "found it" instead of
 * an error on the common path (opening a second balance for a supplier
 * that already exists).
 *
 * If the entity already exists with a *different* category or balanceType
 * than requested, this refuses rather than silently reusing it — changing
 * an entity's direction (payable <-> receivable) out from under its
 * existing transaction history would retroactively flip what every past
 * transaction meant.
 */
async function getOrCreateEntity(
  brandId: string,
  name: string,
  category: LedgerEntityCategory,
  balanceType: LedgerBalanceType,
  actorUserId: string,
): Promise<typeof ledgerEntities.$inferSelect> {
  const [existing] = await db
    .select()
    .from(ledgerEntities)
    .where(and(eq(ledgerEntities.brandId, brandId), sql`lower(${ledgerEntities.name}) = lower(${name})`))
    .limit(1);

  if (existing) {
    if (existing.balanceType !== balanceType) {
      throw ApiError.conflict(
        `"${existing.name}" already exists as ${existing.balanceType === "payable" ? "a payable (we owe them)" : "a receivable (they owe us)"} — pick a different name, or match the existing type.`,
      );
    }
    return existing;
  }

  const [created] = await db
    .insert(ledgerEntities)
    .values({ brandId, name: name.trim(), category, balanceType, createdBy: actorUserId })
    .returning();
  return created!;
}

function toEntityWithBalance(row: {
  id: string;
  brandId: string;
  name: string;
  category: LedgerEntityCategory;
  balanceType: LedgerBalanceType;
  notes: string | null;
  createdAt: Date;
  totalBilled: string;
  amountPaid: string;
}): LedgerEntityWithBalance {
  const totalBilled = Number(row.totalBilled);
  const amountPaid = Number(row.amountPaid);
  return {
    id: row.id,
    brandId: row.brandId,
    name: row.name,
    category: row.category,
    balanceType: row.balanceType,
    notes: row.notes,
    totalBilled,
    amountPaid,
    remainingBalance: totalBilled - amountPaid,
    createdAt: row.createdAt.toISOString(),
  };
}

/** The Suppliers & Debts Ledger table — every entity for this brand with its running totals, worst-first (largest outstanding balance on top). */
export async function listLedgerEntities(brandId: string): Promise<LedgerEntityWithBalance[]> {
  const rows = await db
    .select({
      id: ledgerEntities.id,
      brandId: ledgerEntities.brandId,
      name: ledgerEntities.name,
      category: ledgerEntities.category,
      balanceType: ledgerEntities.balanceType,
      notes: ledgerEntities.notes,
      createdAt: ledgerEntities.createdAt,
      totalBilled: sql<string>`coalesce(sum(${ledgerTransactions.amount}) filter (where ${ledgerTransactions.kind} in ('opening_balance', 'charge')), 0)`,
      amountPaid: sql<string>`coalesce(sum(${ledgerTransactions.amount}) filter (where ${ledgerTransactions.kind} = 'payment'), 0)`,
    })
    .from(ledgerEntities)
    .leftJoin(ledgerTransactions, eq(ledgerTransactions.entityId, ledgerEntities.id))
    .where(eq(ledgerEntities.brandId, brandId))
    .groupBy(ledgerEntities.id);

  const withBalances = rows.map(toEntityWithBalance);
  return withBalances.sort((a, b) => Math.abs(b.remainingBalance) - Math.abs(a.remainingBalance));
}

export async function createOpeningBalance(
  input: CreateOpeningBalanceInput,
  actorUserId: string,
): Promise<LedgerEntityWithBalance> {
  const entity = await getOrCreateEntity(input.brandId, input.entityName, input.category, input.balanceType, actorUserId);

  await db.insert(ledgerTransactions).values({
    entityId: entity.id,
    brandId: entity.brandId,
    kind: "opening_balance",
    amount: input.amount.toFixed(2),
    transactionDate: sql`current_date`,
    dueDate: input.dueDate ?? null,
    notes: input.notes?.trim() || null,
    createdBy: actorUserId,
  });

  const [withBalance] = await listEntitiesByIds([entity.id]);
  return withBalance!;
}

async function listEntitiesByIds(ids: string[]): Promise<LedgerEntityWithBalance[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({
      id: ledgerEntities.id,
      brandId: ledgerEntities.brandId,
      name: ledgerEntities.name,
      category: ledgerEntities.category,
      balanceType: ledgerEntities.balanceType,
      notes: ledgerEntities.notes,
      createdAt: ledgerEntities.createdAt,
      totalBilled: sql<string>`coalesce(sum(${ledgerTransactions.amount}) filter (where ${ledgerTransactions.kind} in ('opening_balance', 'charge')), 0)`,
      amountPaid: sql<string>`coalesce(sum(${ledgerTransactions.amount}) filter (where ${ledgerTransactions.kind} = 'payment'), 0)`,
    })
    .from(ledgerEntities)
    .leftJoin(ledgerTransactions, eq(ledgerTransactions.entityId, ledgerEntities.id))
    .where(inArray(ledgerEntities.id, ids))
    .groupBy(ledgerEntities.id);
  return rows.map(toEntityWithBalance);
}

/** "Record Payment" — settles some (or all, or more than) an entity's outstanding balance. Direction is implied by the entity's balanceType, not re-specified here: paying down a payable and collecting a receivable are the same transaction kind from the ledger's point of view. */
export async function recordPayment(
  entityId: string,
  input: RecordPaymentInput,
  actorUserId: string,
): Promise<LedgerEntityWithBalance> {
  const [entity] = await db.select().from(ledgerEntities).where(eq(ledgerEntities.id, entityId)).limit(1);
  if (!entity) throw ApiError.notFound("Ledger entity not found");

  await db.insert(ledgerTransactions).values({
    entityId,
    brandId: entity.brandId,
    kind: "payment",
    amount: input.amount.toFixed(2),
    transactionDate: input.transactionDate ?? sql`current_date`,
    notes: input.notes?.trim() || null,
    createdBy: actorUserId,
  });

  const [withBalance] = await listEntitiesByIds([entityId]);
  return withBalance!;
}

export interface CashFlowSummary {
  /** Sum of remaining balances across payable entities — what we owe suppliers/factories. */
  accountsPayable: number;
  /** Sum of remaining balances across receivable entities — what couriers/clients still owe us. */
  accountsReceivable: number;
  /**
   * Net Profit (revenue minus every recorded expense — see
   * expenses.service.getFinanceSummary) adjusted for money that hasn't
   * actually moved yet: subtracting what we still owe out and adding back
   * what's still owed to us. This is a liquidity position, not a ledger
   * balance — it can be negative even with a healthy Net Profit if
   * payables have piled up.
   */
  netCashFlow: number;
}

export async function getCashFlowSummary(brandId: string): Promise<CashFlowSummary> {
  const [entities, financeSummary] = await Promise.all([listLedgerEntities(brandId), getFinanceSummary(brandId)]);

  const accountsPayable = entities
    .filter((entity) => entity.balanceType === "payable")
    .reduce((sum, entity) => sum + entity.remainingBalance, 0);
  const accountsReceivable = entities
    .filter((entity) => entity.balanceType === "receivable")
    .reduce((sum, entity) => sum + entity.remainingBalance, 0);

  return {
    accountsPayable,
    accountsReceivable,
    netCashFlow: financeSummary.netProfit - accountsPayable + accountsReceivable,
  };
}
