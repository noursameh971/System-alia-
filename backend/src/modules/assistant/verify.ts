import { sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { businessDate } from "../../utils/businessDate.js";
import { formatEgp } from "./tools/context.js";

/**
 * Checks every draft against the books before its card is shown — the
 * "verify" step of draft → verify → confirm. Deterministic SQL, not the
 * model's judgement: a possible duplicate is flagged whether or not the
 * model thought to look.
 *
 * Warnings never block a draft (the admin may really have paid the same
 * amount twice); they're shown on the card and handed to the model to
 * mention, so Confirm is pressed knowingly.
 */

const DUPLICATE_WINDOW_DAYS = 3;
const SUPPLIER_DUPLICATE_WINDOW_DAYS = 7;
const OLD_ENTRY_DAYS = 90;
const UNUSUAL_MULTIPLE = 3;

type Row = Record<string, unknown>;
async function rows(query: ReturnType<typeof sql>): Promise<Row[]> {
  return (await db.execute(query)).rows as Row[];
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(`${a}T00:00:00Z`).getTime() - new Date(`${b}T00:00:00Z`).getTime()) / 86_400_000);
}

/** Pure: warnings about the entry's date itself. Exported for tests. */
export function dateWarnings(date: string, today = businessDate()): string[] {
  const offset = daysBetween(date, today);
  if (offset > 0) return [`Dated ${date}, which is in the future.`];
  if (-offset > OLD_ENTRY_DAYS) return [`Dated ${date}, ${-offset} days ago — check the date is right.`];
  return [];
}

export interface ExpenseCheckInput {
  brandId: string;
  amount: number;
  expenseDate: string;
  category: string;
  title: string;
  ledgerEntityId?: string | null;
  /** The linked supplier's current state, when there is one. */
  supplier?: { name: string; remainingBalance: number } | null;
}

export async function verifyExpense(input: ExpenseCheckInput): Promise<string[]> {
  const warnings = dateWarnings(input.expenseDate);
  const [duplicates, history] = await Promise.all([
    rows(sql`
      select title, expense_date, amount from expenses
      where brand_id = ${input.brandId} and amount = ${input.amount.toFixed(2)}
        and expense_date between (${input.expenseDate}::date - ${DUPLICATE_WINDOW_DAYS}::int) and (${input.expenseDate}::date + ${DUPLICATE_WINDOW_DAYS}::int)
      order by expense_date desc limit 3`),
    rows(sql`
      select avg(amount)::float as average, count(*)::int as n from expenses
      where brand_id = ${input.brandId} and category = ${input.category} and expense_date >= (${input.expenseDate}::date - 365)`),
  ]);
  for (const duplicate of duplicates) {
    warnings.push(`Possible duplicate: "${duplicate.title}" for ${formatEgp(Number(duplicate.amount))} was already recorded on ${duplicate.expense_date}.`);
  }
  const [{ average, n } = { average: 0, n: 0 }] = history as { average: number; n: number }[];
  if (n >= 3 && average > 0 && input.amount > UNUSUAL_MULTIPLE * average) {
    warnings.push(`Unusually large for this category: about ${Math.round(input.amount / average)}× the past year's average of ${formatEgp(Math.round(average))}.`);
  }
  if (input.supplier) {
    const after = input.supplier.remainingBalance - input.amount;
    if (after < 0) {
      warnings.push(
        `This pays ${input.supplier.name} ${formatEgp(-after)} more than we currently owe them (balance ${formatEgp(input.supplier.remainingBalance)}) — it will show as a credit with them.`,
      );
    }
  }
  return warnings;
}

export async function verifyRevenue(input: { brandId: string; amount: number; revenueDate: string; source: string }): Promise<string[]> {
  const warnings = dateWarnings(input.revenueDate);
  const duplicates = await rows(sql`
    select source, revenue_date from revenues
    where brand_id = ${input.brandId} and amount = ${input.amount.toFixed(2)}
      and revenue_date between (${input.revenueDate}::date - ${DUPLICATE_WINDOW_DAYS}::int) and (${input.revenueDate}::date + ${DUPLICATE_WINDOW_DAYS}::int)
    order by revenue_date desc limit 3`);
  for (const duplicate of duplicates) {
    warnings.push(`Possible duplicate: ${formatEgp(input.amount)} from "${duplicate.source}" was already recorded on ${duplicate.revenue_date}.`);
  }
  return warnings;
}

export async function verifySupplierBill(input: {
  ledgerEntityId: string;
  supplierName: string;
  amount: number;
  transactionDate: string;
  dueDate?: string;
}): Promise<string[]> {
  const warnings = dateWarnings(input.transactionDate);
  if (input.dueDate && input.dueDate < input.transactionDate) {
    warnings.push(`The due date ${input.dueDate} is before the invoice date ${input.transactionDate}.`);
  }
  const duplicates = await rows(sql`
    select transaction_date from ledger_transactions
    where entity_id = ${input.ledgerEntityId} and kind in ('charge', 'opening_balance') and amount = ${input.amount.toFixed(2)}
      and transaction_date between (${input.transactionDate}::date - ${SUPPLIER_DUPLICATE_WINDOW_DAYS}::int) and (${input.transactionDate}::date + ${SUPPLIER_DUPLICATE_WINDOW_DAYS}::int)
    limit 3`);
  for (const duplicate of duplicates) {
    warnings.push(`Possible duplicate: a ${formatEgp(input.amount)} bill from ${input.supplierName} is already in the ledger on ${duplicate.transaction_date}.`);
  }
  return warnings;
}
