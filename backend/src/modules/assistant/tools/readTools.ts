import { z } from "zod";
import { getBrandDashboardSummary } from "../../dashboard/dashboard.service.js";
import { EXPENSE_CATEGORIES } from "../../expenses/expenses.schema.js";
import { getFinanceSummary, listExpenses } from "../../expenses/expenses.service.js";
import { getCashFlowSummary, listLedgerEntities } from "../../ledger/ledger.service.js";
import { REVENUE_CATEGORIES } from "../../revenues/revenues.schema.js";
import { listRevenues } from "../../revenues/revenues.service.js";
import { brandCodeField, money, resolveBrand, toolJson, type ToolContext } from "./context.js";
import { defineTool } from "./defineTool.js";

/**
 * Read-only tools. Each wraps an existing service and returns only the
 * fields an answer needs — everything here is sent to the model provider, so
 * IDs, receipt URLs, phone numbers and audit columns are left out unless a
 * follow-up tool call needs them.
 */

const dateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .optional();

const rangeFields = {
  from: dateField.describe("Inclusive start date, YYYY-MM-DD. Omit for no lower bound."),
  to: dateField.describe("Inclusive end date, YYYY-MM-DD. Omit for no upper bound."),
};

/** Lists can be long; the model gets the totals over every match plus the most recent rows. */
const DEFAULT_LIST_LIMIT = 25;
const MAX_LIST_LIMIT = 100;

const limitField = z.coerce
  .number()
  .int()
  .min(1)
  .max(MAX_LIST_LIMIT)
  .optional()
  .describe(`Max rows to return, newest first (default ${DEFAULT_LIST_LIMIT}). Totals always cover every match.`);

export function buildReadTools(ctx: ToolContext) {
  const getFinanceSummaryTool = defineTool({
    name: "get_finance_summary",
    description:
      "Profit & loss for one workspace over an optional date range: gross revenue (orders + hand-recorded revenue), " +
      "COGS, order shipping fees, operating expenses by category, net profit and margin. " +
      "Use for any revenue / expense / profit total. Without from/to it covers all time.",
    inputSchema: z.object({ brand: brandCodeField, ...rangeFields }),
    run: async ({ brand: brandCode, from, to }) => {
      const brand = resolveBrand(ctx, brandCode);
      const summary = await getFinanceSummary(brand.id, { from, to });
      return toolJson({
        workspace: brand.code,
        range: { from: from ?? "all time", to: to ?? "today" },
        currency: "EGP",
        grossRevenue: money(summary.grossRevenue),
        orderRevenue: money(summary.orderRevenue),
        manualRevenue: money(summary.manualRevenue),
        cogs: money(summary.cogs),
        orderShippingFees: money(summary.shipping),
        operatingExpenses: money(summary.operatingExpenses),
        operatingExpensesByCategory: Object.fromEntries(
          Object.entries(summary.byCategory)
            .filter(([, amount]) => amount !== 0)
            .map(([category, amount]) => [category, money(amount)]),
        ),
        totalExpenses: money(summary.totalExpenses),
        netProfit: money(summary.netProfit),
        profitMarginPercent: Math.round(summary.profitMargin * 10) / 10,
        orderCount: summary.orderCount,
        manualRevenueEntries: summary.revenueCount,
        expenseEntries: summary.expenseCount,
      });
    },
  });

  const listExpensesTool = defineTool({
    name: "list_expenses",
    description:
      "Hand-recorded operating expenses for one workspace, newest first, with the total over every match. " +
      "Filter by date range and/or category. Use to answer 'what did we spend on X' or to find a specific expense.",
    inputSchema: z.object({
      brand: brandCodeField,
      ...rangeFields,
      category: z.enum(EXPENSE_CATEGORIES).optional(),
      limit: limitField,
    }),
    run: async ({ brand: brandCode, from, to, category, limit }) => {
      const brand = resolveBrand(ctx, brandCode);
      const rows = await listExpenses({ brandId: brand.id, from, to, category });
      return toolJson({
        workspace: brand.code,
        matchCount: rows.length,
        total: money(rows.reduce((sum, row) => sum + row.amount, 0)),
        currency: "EGP",
        expenses: rows.slice(0, limit ?? DEFAULT_LIST_LIMIT).map((row) => ({
          date: row.expenseDate,
          title: row.title,
          category: row.category,
          amount: row.amount,
          paymentMethod: row.paymentMethod,
          paidTo: row.ledgerEntityName,
          notes: row.notes,
        })),
      });
    },
  });

  const listRevenuesTool = defineTool({
    name: "list_revenues",
    description:
      "Hand-recorded revenue for one workspace (sales that never became an Order: wholesale invoices, in-person/DM sales, " +
      "shipping income), newest first, with the total over every match. Does NOT include order revenue — use " +
      "get_finance_summary for totals that include orders.",
    inputSchema: z.object({
      brand: brandCodeField,
      ...rangeFields,
      category: z.enum(REVENUE_CATEGORIES).optional(),
      limit: limitField,
    }),
    run: async ({ brand: brandCode, from, to, category, limit }) => {
      const brand = resolveBrand(ctx, brandCode);
      const rows = await listRevenues({ brandId: brand.id, from, to, category });
      return toolJson({
        workspace: brand.code,
        matchCount: rows.length,
        total: money(rows.reduce((sum, row) => sum + row.amount, 0)),
        currency: "EGP",
        revenues: rows.slice(0, limit ?? DEFAULT_LIST_LIMIT).map((row) => ({
          date: row.revenueDate,
          source: row.source,
          category: row.category,
          amount: row.amount,
          notes: row.notes,
        })),
      });
    },
  });

  const getCashFlowTool = defineTool({
    name: "get_cash_flow",
    description:
      "Current liquidity for one workspace: accounts payable (what we still owe suppliers), accounts receivable " +
      "(what others still owe us) and net cash flow. All-time balances, no date range.",
    inputSchema: z.object({ brand: brandCodeField }),
    run: async ({ brand: brandCode }) => {
      const brand = resolveBrand(ctx, brandCode);
      const cashFlow = await getCashFlowSummary(brand.id);
      return toolJson({
        workspace: brand.code,
        currency: "EGP",
        accountsPayable: money(cashFlow.accountsPayable),
        accountsReceivable: money(cashFlow.accountsReceivable),
        netCashFlow: money(cashFlow.netCashFlow),
      });
    },
  });

  const findLedgerEntitiesTool = defineTool({
    name: "find_ledger_entities",
    description:
      "Search one workspace's suppliers & debts ledger (suppliers, factories, couriers, clients) by name, with each " +
      "one's outstanding balance. payable = we owe them; receivable = they owe us. Call this before proposing an " +
      "expense that pays a known supplier, to get its ledgerEntityId.",
    inputSchema: z.object({
      brand: brandCodeField,
      name: z.string().trim().max(200).optional().describe("Case-insensitive part of the name. Omit to list the largest balances."),
      balanceType: z.enum(["payable", "receivable"]).optional(),
    }),
    run: async ({ brand: brandCode, name, balanceType }) => {
      const brand = resolveBrand(ctx, brandCode);
      const needle = name?.toLowerCase();
      const matches = (await listLedgerEntities(brand.id)).filter(
        (entity) =>
          (!needle || entity.name.toLowerCase().includes(needle)) && (!balanceType || entity.balanceType === balanceType),
      );
      return toolJson({
        workspace: brand.code,
        matchCount: matches.length,
        currency: "EGP",
        entities: matches.slice(0, 10).map((entity) => ({
          ledgerEntityId: entity.id,
          name: entity.name,
          category: entity.category,
          balanceType: entity.balanceType,
          totalBilled: money(entity.totalBilled),
          amountPaid: money(entity.amountPaid),
          remainingBalance: money(entity.remainingBalance),
        })),
      });
    },
  });

  const getInventoryOverviewTool = defineTool({
    name: "get_inventory_overview",
    description:
      "Stock snapshot for one workspace: units on hand, stock value at cost and at retail, all-time best-selling " +
      "items, and items at or below the low-stock threshold set in Settings. Use for inventory and 'what's selling' questions; use " +
      "get_finance_summary for money totals.",
    inputSchema: z.object({ brand: brandCodeField }),
    run: async ({ brand: brandCode }) => {
      const brand = resolveBrand(ctx, brandCode);
      const summary = await getBrandDashboardSummary(brand.id);
      const item = (row: { sku: string; productName: string; color: string | null; size: string | null }) => ({
        sku: row.sku,
        product: row.productName,
        color: row.color,
        size: row.size,
      });
      return toolJson({
        workspace: brand.code,
        currency: "EGP",
        unitsOnHand: summary.inventoryUnitCount,
        stockValueAtCost: money(summary.inventoryValue),
        stockValueAtRetail: money(summary.potentialRetailValue),
        topSellingAllTime: summary.topSellingItems.slice(0, 10).map((row) => ({
          ...item(row),
          quantitySold: row.quantitySold,
          revenue: money(row.revenue),
        })),
        lowStock: summary.lowStockItems.map((row) => ({ ...item(row), stock: row.stock })),
      });
    },
  });

  return [
    getFinanceSummaryTool,
    listExpensesTool,
    listRevenuesTool,
    getCashFlowTool,
    findLedgerEntitiesTool,
    getInventoryOverviewTool,
  ];
}
