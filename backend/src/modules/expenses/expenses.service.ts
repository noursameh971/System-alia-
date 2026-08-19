import { and, desc, eq, gte, lte, ne, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { expenses, orderItems, orders, productVariants, products } from "../../db/schema/index.js";
import { ApiError } from "../../utils/apiError.js";
import {
  EXPENSE_CATEGORIES,
  type CreateExpenseInput,
  type ExpenseCategory,
  type ExpensePaymentMethod,
  type ListExpensesQuery,
  type UpdateExpenseInput,
} from "./expenses.schema.js";

export interface ExpenseRecord {
  id: string;
  brandId: string;
  title: string;
  category: ExpenseCategory;
  amount: number;
  currency: string;
  paymentMethod: ExpensePaymentMethod;
  expenseDate: string;
  receiptUrl: string | null;
  notes: string | null;
  createdAt: string;
}

function toRecord(row: typeof expenses.$inferSelect): ExpenseRecord {
  return {
    id: row.id,
    brandId: row.brandId,
    title: row.title,
    category: row.category,
    amount: Number(row.amount),
    currency: row.currency,
    paymentMethod: row.paymentMethod,
    expenseDate: row.expenseDate,
    receiptUrl: row.receiptUrl,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listExpenses(query: ListExpensesQuery): Promise<ExpenseRecord[]> {
  const filters = [eq(expenses.brandId, query.brandId)];
  if (query.category) filters.push(eq(expenses.category, query.category));
  if (query.from) filters.push(gte(expenses.expenseDate, query.from));
  if (query.to) filters.push(lte(expenses.expenseDate, query.to));

  const rows = await db
    .select()
    .from(expenses)
    .where(and(...filters))
    .orderBy(desc(expenses.expenseDate), desc(expenses.createdAt));

  return rows.map(toRecord);
}

export async function createExpense(input: CreateExpenseInput, actorUserId: string): Promise<ExpenseRecord> {
  const [created] = await db
    .insert(expenses)
    .values({
      brandId: input.brandId,
      title: input.title,
      category: input.category,
      amount: input.amount.toFixed(2),
      paymentMethod: input.paymentMethod,
      expenseDate: input.expenseDate,
      receiptUrl: input.receiptUrl?.trim() || null,
      notes: input.notes?.trim() || null,
      createdBy: actorUserId,
    })
    .returning();

  return toRecord(created!);
}

export async function updateExpense(id: string, input: UpdateExpenseInput): Promise<ExpenseRecord> {
  const [updated] = await db
    .update(expenses)
    .set({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.amount !== undefined ? { amount: input.amount.toFixed(2) } : {}),
      ...(input.paymentMethod !== undefined ? { paymentMethod: input.paymentMethod } : {}),
      ...(input.expenseDate !== undefined ? { expenseDate: input.expenseDate } : {}),
      ...(input.receiptUrl !== undefined ? { receiptUrl: input.receiptUrl.trim() || null } : {}),
      ...(input.notes !== undefined ? { notes: input.notes.trim() || null } : {}),
      updatedAt: sql`now()`,
    })
    .where(eq(expenses.id, id))
    .returning();

  if (!updated) throw ApiError.notFound("Expense not found");
  return toRecord(updated);
}

export async function deleteExpense(id: string): Promise<void> {
  const [deleted] = await db.delete(expenses).where(eq(expenses.id, id)).returning({ id: expenses.id });
  if (!deleted) throw ApiError.notFound("Expense not found");
}

/** Used by requireBrandAccess-style checks on :id routes, where the brand isn't in the URL. */
export async function getExpenseBrandId(id: string): Promise<string> {
  const [row] = await db.select({ brandId: expenses.brandId }).from(expenses).where(eq(expenses.id, id)).limit(1);
  if (!row) throw ApiError.notFound("Expense not found");
  return row.brandId;
}

export type CategoryTotals = Record<ExpenseCategory, number>;

export interface MonthlyExpensePoint {
  /** YYYY-MM. */
  month: string;
  categories: CategoryTotals;
  total: number;
}

export interface FinanceSummary {
  grossRevenue: number;
  /** Production cost of everything sold, from order_items.cost_at_sale snapshots. */
  cogs: number;
  /** Shipping fees charged on orders — a real cost of fulfilment, so it sits in expenses, not revenue. */
  shipping: number;
  /** Hand-recorded expenses from the ledger. */
  operatingExpenses: number;
  /** cogs + shipping + operatingExpenses. */
  totalExpenses: number;
  netProfit: number;
  profitMargin: number;
  orderCount: number;
  expenseCount: number;
  byCategory: CategoryTotals;
  monthly: MonthlyExpensePoint[];
}

function emptyCategoryTotals(): CategoryTotals {
  return Object.fromEntries(EXPENSE_CATEGORIES.map((category) => [category, 0])) as CategoryTotals;
}

const MONTHS_IN_BREAKDOWN = 6;

/** Oldest-first list of the last N months as YYYY-MM, so a month with no expenses still renders as a zero bar rather than vanishing from the chart. */
function recentMonths(count: number): string[] {
  const now = new Date();
  const months: string[] = [];
  for (let offset = count - 1; offset >= 0; offset--) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    months.push(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

/**
 * The Finance page's KPI cards + breakdown chart, for one brand.
 *
 * Total Expenses deliberately spans all three sources — derived COGS,
 * derived shipping, and the hand-recorded ledger — because a fashion
 * brand's real profit isn't revenue minus fabric cost alone. The ledger
 * never records COGS or shipping itself (see the expenses table comment),
 * so nothing here double-counts.
 */
export async function getFinanceSummary(brandId: string): Promise<FinanceSummary> {
  // Cancelled orders are excluded from both revenue and cost: they were
  // never fulfilled, so counting their COGS would invent an expense.
  const [revenueRow] = await db
    .select({
      revenue: sql<string>`coalesce(sum(${orderItems.subtotal}), 0)`,
      cogs: sql<string>`coalesce(sum(${orderItems.quantity} * ${orderItems.costAtSale}), 0)`,
      orderCount: sql<number>`count(distinct ${orders.id})::int`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .innerJoin(productVariants, eq(productVariants.id, orderItems.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(and(eq(products.brandId, brandId), ne(orders.status, "cancelled")));

  // Shipping is a per-order column, so it must be summed in its own query —
  // joining through order_items would multiply it by the item count.
  const [shippingRow] = await db
    .select({ shipping: sql<string>`coalesce(sum(${orders.shippingFee}), 0)` })
    .from(orders)
    .where(and(eq(orders.brandId, brandId), ne(orders.status, "cancelled")));

  const categoryRows = await db
    .select({
      category: expenses.category,
      month: sql<string>`to_char(${expenses.expenseDate}, 'YYYY-MM')`,
      total: sql<string>`coalesce(sum(${expenses.amount}), 0)`,
      count: sql<number>`count(*)::int`,
    })
    .from(expenses)
    .where(eq(expenses.brandId, brandId))
    .groupBy(expenses.category, sql`to_char(${expenses.expenseDate}, 'YYYY-MM')`);

  const byCategory = emptyCategoryTotals();
  const monthlyMap = new Map<string, CategoryTotals>();
  let operatingExpenses = 0;
  let expenseCount = 0;

  for (const row of categoryRows) {
    const amount = Number(row.total);
    byCategory[row.category] += amount;
    operatingExpenses += amount;
    expenseCount += row.count;

    const bucket = monthlyMap.get(row.month) ?? emptyCategoryTotals();
    bucket[row.category] += amount;
    monthlyMap.set(row.month, bucket);
  }

  const monthly: MonthlyExpensePoint[] = recentMonths(MONTHS_IN_BREAKDOWN).map((month) => {
    const categories = monthlyMap.get(month) ?? emptyCategoryTotals();
    return {
      month,
      categories,
      total: Object.values(categories).reduce((sum, value) => sum + value, 0),
    };
  });

  const grossRevenue = Number(revenueRow?.revenue ?? 0);
  const cogs = Number(revenueRow?.cogs ?? 0);
  const shipping = Number(shippingRow?.shipping ?? 0);
  const totalExpenses = cogs + shipping + operatingExpenses;
  const netProfit = grossRevenue - totalExpenses;

  return {
    grossRevenue,
    cogs,
    shipping,
    operatingExpenses,
    totalExpenses,
    netProfit,
    profitMargin: grossRevenue > 0 ? (netProfit / grossRevenue) * 100 : 0,
    orderCount: revenueRow?.orderCount ?? 0,
    expenseCount,
    byCategory,
    monthly,
  };
}
