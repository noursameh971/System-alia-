import { and, eq, gte, isNull, lte, ne, notExists, or, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import {
  brandOpeningBalances,
  expenses,
  inventory,
  ledgerEntities,
  ledgerTransactions,
  orders,
  orderItems,
  productVariants,
  products,
  revenues,
  variantCosts,
} from "../../db/schema/index.js";
import { BUSINESS_TIMEZONE } from "../../utils/businessDate.js";
import { getFinanceSummary, type FinanceDateRange } from "../expenses/expenses.service.js";
import type { ExpenseCategory } from "../expenses/expenses.schema.js";
import { listLedgerEntities } from "../ledger/ledger.service.js";

/**
 * Financial statements (Income Statement, Cash Flow, Balance Sheet) for one
 * brand — a read-only analytical layer over the same tables the rest of the
 * Finance page uses. Nothing here is stored.
 *
 * The Income Statement is built from expenses.service#getFinanceSummary
 * itself rather than re-deriving revenue/COGS/expenses, so its Net Profit is
 * always the exact figure on the Finance page's KPI cards.
 */

type RevenueCategory = (typeof revenues.category.enumValues)[number];

export interface IncomeStatement {
  orderRevenue: number;
  /** Hand-recorded revenue split by its category — sums to manualRevenue. */
  otherRevenue: Record<RevenueCategory, number>;
  totalRevenue: number;
  costOfSales: {
    /** Product cost of orders sold, from order_items.cost_at_sale snapshots. */
    orderCogs: number;
    /** Expenses recorded under the "production" category — manufacturing spend, so it belongs in cost of sales rather than overheads. */
    productionExpenses: number;
    total: number;
  };
  grossProfit: number;
  /** grossProfit / totalRevenue * 100, or 0 when there's no revenue. */
  grossMargin: number;
  /** Order shipping fees — treated as a fulfilment expense, same as getFinanceSummary. */
  shipping: number;
  /** Every expense category except production, which is in costOfSales. */
  operatingExpensesByCategory: Record<Exclude<ExpenseCategory, "production">, number>;
  /** shipping + every non-production recorded expense. */
  totalOperatingExpenses: number;
  netProfit: number;
  netMargin: number;
}

export interface CashFlowStatement {
  inflows: {
    /** Non-cancelled orders whose money has actually arrived: delivered (COD collected) or paid online. */
    collectedOrderSales: number;
    recordedRevenue: number;
    /** Payments received against receivable ledger accounts. */
    receivableCollections: number;
    total: number;
  };
  outflows: {
    /** Every recorded expense — the expenses ledger only holds money actually paid. */
    expensesPaid: number;
    /**
     * Supplier payments recorded only in the Suppliers & Debts ledger. A
     * payment that was entered as an expense (expenses.ledger_transaction_id)
     * is already in expensesPaid and is left out here so it isn't counted twice.
     */
    supplierPaymentsNotInExpenses: number;
    /** Shipping fees on the collected orders above, matching the Income Statement's treatment of shipping as a cost. */
    shippingOnCollectedOrders: number;
    total: number;
  };
  netCashChange: number;
  /** Not cash yet: non-cancelled COD orders that haven't been delivered. Informational only. */
  pendingCodOrderSales: number;
}

export interface OpeningBalances {
  startingCash: number;
  ownerCapital: number;
  /** YYYY-MM-DD, or null for "before the first record". */
  asOfDate: string | null;
  /** False until someone saves starting balances for this brand. */
  isSet: boolean;
}

export interface BalanceSheet {
  openingBalances: OpeningBalances;
  assets: {
    /** The entered starting bank/cash balance (0 if never set). */
    startingCash: number;
    /** Net cash change from recorded flows on or after openingBalances.asOfDate (all of them when it's null). */
    recordedCashFlow: number;
    /** startingCash + recordedCashFlow. */
    cash: number;
    /** On-hand units × current active production cost, same valuation as the dashboards' Inventory Value. */
    inventory: number;
    accountsReceivable: number;
    total: number;
  };
  liabilities: {
    accountsPayable: number;
    total: number;
  };
  equity: {
    /** The entered owner's starting capital (0 if never set). */
    ownerCapital: number;
    /** Net profit on or after openingBalances.asOfDate (all-time when it's null). */
    retainedEarnings: number;
    /**
     * Balancing figure: whatever makes assets = liabilities + equity once
     * capital and profit are accounted for — e.g. opening supplier balances
     * or stock that existed before the starting date. Near zero when the
     * starting balances fully describe the opening position.
     */
    otherAdjustments: number;
    total: number;
  };
}

export interface FinancialStatements {
  range: FinanceDateRange;
  incomeStatement: IncomeStatement;
  cashFlow: CashFlowStatement;
  /** Always as of today, regardless of range — a balance sheet is a point-in-time snapshot. */
  balanceSheet: BalanceSheet;
}

const percent = (part: number, whole: number) => (whole !== 0 ? (part / whole) * 100 : 0);

function emptyRevenueCategories(): Record<RevenueCategory, number> {
  return Object.fromEntries(revenues.category.enumValues.map((c) => [c, 0])) as Record<RevenueCategory, number>;
}

async function getIncomeStatement(brandId: string, range: FinanceDateRange): Promise<IncomeStatement> {
  const [summary, revenueRows] = await Promise.all([
    getFinanceSummary(brandId, range),
    db
      .select({ category: revenues.category, total: sql<string>`coalesce(sum(${revenues.amount}), 0)` })
      .from(revenues)
      .where(
        and(
          eq(revenues.brandId, brandId),
          range.from ? gte(revenues.revenueDate, range.from) : undefined,
          range.to ? lte(revenues.revenueDate, range.to) : undefined,
        ),
      )
      .groupBy(revenues.category),
  ]);

  const otherRevenue = emptyRevenueCategories();
  for (const row of revenueRows) otherRevenue[row.category] = Number(row.total);

  // Only reclassifies where production spend is shown — every amount still
  // comes from the summary, so netProfit is unchanged.
  const { production: productionExpenses, ...overheads } = summary.byCategory;
  const costOfSalesTotal = summary.cogs + productionExpenses;
  const grossProfit = summary.grossRevenue - costOfSalesTotal;
  return {
    orderRevenue: summary.orderRevenue,
    otherRevenue,
    totalRevenue: summary.grossRevenue,
    costOfSales: { orderCogs: summary.cogs, productionExpenses, total: costOfSalesTotal },
    grossProfit,
    grossMargin: percent(grossProfit, summary.grossRevenue),
    shipping: summary.shipping,
    operatingExpensesByCategory: overheads,
    totalOperatingExpenses: summary.shipping + summary.operatingExpenses - productionExpenses,
    netProfit: summary.netProfit,
    netMargin: summary.profitMargin,
  };
}

async function getCashFlowStatement(brandId: string, range: FinanceDateRange): Promise<CashFlowStatement> {
  const orderDay = sql`(${orders.orderDate} at time zone ${BUSINESS_TIMEZONE})::date`;
  const orderFilters = [
    eq(orders.brandId, brandId),
    ne(orders.status, "cancelled"),
    ...(range.from ? [sql`${orderDay} >= ${range.from}`] : []),
    ...(range.to ? [sql`${orderDay} <= ${range.to}`] : []),
  ];
  const isCollected = or(eq(orders.status, "delivered"), eq(orders.paymentMethod, "online"));
  const collectedFlag = sql<boolean>`(${orders.status} = 'delivered' or ${orders.paymentMethod} = 'online')`;

  const [orderSalesRows, shippingRow, revenueRow, expenseRow, ledgerRows] = await Promise.all([
    // Sales split by collected vs not-yet-collected in one pass.
    db
      .select({ collected: collectedFlag, total: sql<string>`coalesce(sum(${orderItems.subtotal}), 0)` })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(and(...orderFilters))
      .groupBy(collectedFlag),
    // Per-order column — summed separately so it isn't multiplied by item count.
    db
      .select({ total: sql<string>`coalesce(sum(${orders.shippingFee}), 0)` })
      .from(orders)
      .where(and(...orderFilters, isCollected)),
    db
      .select({ total: sql<string>`coalesce(sum(${revenues.amount}), 0)` })
      .from(revenues)
      .where(
        and(
          eq(revenues.brandId, brandId),
          range.from ? gte(revenues.revenueDate, range.from) : undefined,
          range.to ? lte(revenues.revenueDate, range.to) : undefined,
        ),
      ),
    db
      .select({ total: sql<string>`coalesce(sum(${expenses.amount}), 0)` })
      .from(expenses)
      .where(
        and(
          eq(expenses.brandId, brandId),
          range.from ? gte(expenses.expenseDate, range.from) : undefined,
          range.to ? lte(expenses.expenseDate, range.to) : undefined,
        ),
      ),
    db
      .select({ balanceType: ledgerEntities.balanceType, total: sql<string>`coalesce(sum(${ledgerTransactions.amount}), 0)` })
      .from(ledgerTransactions)
      .innerJoin(ledgerEntities, eq(ledgerEntities.id, ledgerTransactions.entityId))
      .where(
        and(
          eq(ledgerTransactions.brandId, brandId),
          eq(ledgerTransactions.kind, "payment"),
          range.from ? gte(ledgerTransactions.transactionDate, range.from) : undefined,
          range.to ? lte(ledgerTransactions.transactionDate, range.to) : undefined,
          // Payable payments already entered as an expense are in expensesPaid.
          or(
            eq(ledgerEntities.balanceType, "receivable"),
            notExists(db.select().from(expenses).where(eq(expenses.ledgerTransactionId, ledgerTransactions.id))),
          ),
        ),
      )
      .groupBy(ledgerEntities.balanceType),
  ]);

  const collectedOrderSales = Number(orderSalesRows.find((r) => r.collected)?.total ?? 0);
  const pendingCodOrderSales = Number(orderSalesRows.find((r) => !r.collected)?.total ?? 0);
  const recordedRevenue = Number(revenueRow[0]?.total ?? 0);
  const receivableCollections = Number(ledgerRows.find((r) => r.balanceType === "receivable")?.total ?? 0);
  const expensesPaid = Number(expenseRow[0]?.total ?? 0);
  const supplierPaymentsNotInExpenses = Number(ledgerRows.find((r) => r.balanceType === "payable")?.total ?? 0);
  const shippingOnCollectedOrders = Number(shippingRow[0]?.total ?? 0);

  const inflowTotal = collectedOrderSales + recordedRevenue + receivableCollections;
  const outflowTotal = expensesPaid + supplierPaymentsNotInExpenses + shippingOnCollectedOrders;

  return {
    inflows: { collectedOrderSales, recordedRevenue, receivableCollections, total: inflowTotal },
    outflows: { expensesPaid, supplierPaymentsNotInExpenses, shippingOnCollectedOrders, total: outflowTotal },
    netCashChange: inflowTotal - outflowTotal,
    pendingCodOrderSales,
  };
}

async function getInventoryValue(brandId: string): Promise<number> {
  const [row] = await db
    .select({ value: sql<string>`coalesce(sum(${inventory.quantity} * coalesce(${variantCosts.cost}, 0)), 0)` })
    .from(inventory)
    .innerJoin(productVariants, eq(productVariants.id, inventory.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(variantCosts, and(eq(variantCosts.variantId, productVariants.id), isNull(variantCosts.effectiveTo)))
    .where(eq(products.brandId, brandId));
  return Number(row?.value ?? 0);
}

export async function getOpeningBalances(brandId: string): Promise<OpeningBalances> {
  const [row] = await db.select().from(brandOpeningBalances).where(eq(brandOpeningBalances.brandId, brandId)).limit(1);
  if (!row) return { startingCash: 0, ownerCapital: 0, asOfDate: null, isSet: false };
  return {
    startingCash: Number(row.startingCash),
    ownerCapital: Number(row.ownerCapital),
    asOfDate: row.asOfDate,
    isSet: true,
  };
}

export async function saveOpeningBalances(
  brandId: string,
  input: { startingCash: number; ownerCapital: number; asOfDate: string | null },
  actorUserId: string,
): Promise<OpeningBalances> {
  const values = {
    startingCash: input.startingCash.toFixed(2),
    ownerCapital: input.ownerCapital.toFixed(2),
    asOfDate: input.asOfDate,
    updatedBy: actorUserId,
    updatedAt: sql`now()`,
  };
  await db
    .insert(brandOpeningBalances)
    .values({ brandId, ...values })
    .onConflictDoUpdate({ target: brandOpeningBalances.brandId, set: values });
  return getOpeningBalances(brandId);
}

async function getBalanceSheet(brandId: string): Promise<BalanceSheet> {
  const openingBalances = await getOpeningBalances(brandId);
  // Flows before the starting date are assumed to be already reflected in
  // the entered starting cash/capital, so only later ones are added.
  const sinceStart: FinanceDateRange = openingBalances.asOfDate ? { from: openingBalances.asOfDate } : {};
  const [cashSinceStart, inventoryValue, entities, summarySinceStart] = await Promise.all([
    getCashFlowStatement(brandId, sinceStart),
    getInventoryValue(brandId),
    listLedgerEntities(brandId),
    getFinanceSummary(brandId, sinceStart),
  ]);

  const sumRemaining = (type: "payable" | "receivable") =>
    entities.filter((e) => e.balanceType === type).reduce((sum, e) => sum + e.remainingBalance, 0);

  const accountsReceivable = sumRemaining("receivable");
  const accountsPayable = sumRemaining("payable");
  const recordedCashFlow = cashSinceStart.netCashChange;
  const cash = openingBalances.startingCash + recordedCashFlow;
  const totalAssets = cash + inventoryValue + accountsReceivable;
  const totalEquity = totalAssets - accountsPayable;
  const retainedEarnings = summarySinceStart.netProfit;

  return {
    openingBalances,
    assets: {
      startingCash: openingBalances.startingCash,
      recordedCashFlow,
      cash,
      inventory: inventoryValue,
      accountsReceivable,
      total: totalAssets,
    },
    liabilities: { accountsPayable, total: accountsPayable },
    equity: {
      ownerCapital: openingBalances.ownerCapital,
      retainedEarnings,
      otherAdjustments: totalEquity - openingBalances.ownerCapital - retainedEarnings,
      total: totalEquity,
    },
  };
}

export async function getFinancialStatements(brandId: string, range: FinanceDateRange): Promise<FinancialStatements> {
  const [incomeStatement, cashFlow, balanceSheet] = await Promise.all([
    getIncomeStatement(brandId, range),
    getCashFlowStatement(brandId, range),
    getBalanceSheet(brandId),
  ]);
  return { range, incomeStatement, cashFlow, balanceSheet };
}
