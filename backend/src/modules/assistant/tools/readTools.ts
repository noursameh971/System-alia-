import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../../db/client.js";
import { businessDate } from "../../../utils/businessDate.js";
import { getBrandDashboardSummary } from "../../dashboard/dashboard.service.js";
import { EXPENSE_CATEGORIES } from "../../expenses/expenses.schema.js";
import { getFinanceSummary, listExpenses } from "../../expenses/expenses.service.js";
import { getFactoryDashboardSummary } from "../../factory/dashboard.service.js";
import { getMrpReport, getScrapReport } from "../../factory/reports.service.js";
import { listWorkOrders } from "../../factory/workOrders.service.js";
import { searchKnowledge } from "../../knowledge/search.service.js";
import { getCashFlowSummary, getLedgerEntityWithTransactions, listLedgerEntities } from "../../ledger/ledger.service.js";
import { REVENUE_CATEGORIES } from "../../revenues/revenues.schema.js";
import { listRevenues } from "../../revenues/revenues.service.js";
import { getSettings } from "../../settings/settings.service.js";
import { brandCodeField, money, resolveBrand, toolJson, ToolInputError, type BrandRef, type ToolContext } from "./context.js";
import { defineTool } from "./defineTool.js";

/**
 * Read-only tools: a few broad ones, each with a `view`, rather than many
 * narrow ones. Every tool definition is resent to the model on every step,
 * and the provider's per-minute token budget is small, so fewer, denser
 * schemas leave room for more steps — and one call often answers what used
 * to take two.
 *
 * Results carry only what an answer needs (everything here goes to the
 * model provider): no phone numbers, addresses, receipt URLs or audit
 * columns; ids only where a follow-up call needs one.
 */

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").optional();
const range = { from: date.describe("Inclusive YYYY-MM-DD"), to: date.describe("Inclusive YYYY-MM-DD") };
const limit = z.coerce.number().int().min(1).max(100).optional().describe("Max rows, newest first (default 25)");
const DEFAULT_LIMIT = 25;

type Row = Record<string, unknown>;
async function rows(query: ReturnType<typeof sql>): Promise<Row[]> {
  return (await db.execute(query)).rows as Row[];
}
const num = (value: unknown) => money(Number(value ?? 0));

/** Calendar months ending with the one containing `to` (default: this month), oldest first. */
export function monthRanges(count: number, to?: string): { month: string; from: string; to: string; partial: boolean }[] {
  const end = to ?? businessDate();
  const [year, month] = end.split("-").map(Number) as [number, number];
  return Array.from({ length: count }, (_, index) => {
    const d = new Date(Date.UTC(year, month - 1 - (count - 1 - index), 1));
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
    const iso = (value: Date) => value.toISOString().slice(0, 10);
    const monthEnd = iso(last);
    return { month: iso(d).slice(0, 7), from: iso(d), to: monthEnd < end ? monthEnd : end, partial: monthEnd > end };
  });
}

function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

/** Words of a search phrase, each of which must match somewhere — "linen abaya M" finds the medium linen abaya. */
function termsCondition(search: string | undefined, columns: ReturnType<typeof sql>[]) {
  const terms = (search ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 6);
  if (terms.length === 0) return sql`true`;
  return sql.join(
    terms.map((term) => sql`(${sql.join(columns.map((column) => sql`${column} ilike ${`%${term}%`}`), sql` or `)})`),
    sql` and `,
  );
}

async function financeSummary(brand: BrandRef, from?: string, to?: string) {
  const summary = await getFinanceSummary(brand.id, { from, to });
  return {
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
    orders: summary.orderCount,
    manualRevenueEntries: summary.revenueCount,
    expenseEntries: summary.expenseCount,
  };
}

export function buildReadTools(ctx: ToolContext) {
  const searchKnowledgeTool = defineTool({
    name: "search_knowledge",
    description:
      "Search the company knowledge base by meaning and keywords, in Arabic or English: uploaded documents " +
      "(supplier contracts, price lists, policies) and every business record (suppliers, products, materials, expenses, " +
      "revenue, ledger entries, receipts, orders, work orders). Use it to find WHO/WHAT/WHICH, document terms, or a past " +
      "entry you only know by description. Snippets can be out of date for live figures (stock, balances) — get those " +
      "from the other tools. Cite hits by their ref, e.g. [K2].",
    inputSchema: z.object({
      query: z.string().trim().min(2).max(300).describe("What to look for, in the admin's words; add the other language's key terms if useful"),
      brand: brandCodeField,
      scope: z.enum(["all", "documents", "records"]).optional().describe("documents = uploaded files only; records = business rows only"),
    }),
    run: async ({ query, brand: brandCode, scope }) => {
      const brand = brandCode ? resolveBrand(ctx, brandCode) : ctx.activeBrand;
      const hits = await searchKnowledge(query, {
        brandId: brand?.id ?? null,
        sourceTypes: scope === "documents" ? ["upload"] : undefined,
        limit: 6,
      });
      const filtered = scope === "records" ? hits.filter((hit) => hit.sourceType !== "upload") : hits;
      return toolJson({
        workspace: brand?.code ?? "all",
        hits: filtered.map((hit) => ({
          ref: `K${++ctx.knowledgeRefs}`,
          type: hit.sourceType === "upload" ? "document" : hit.sourceType,
          title: hit.title,
          text: hit.content.length > 650 ? `${hit.content.slice(0, 650)}…` : hit.content,
          ...(hit.ledgerEntityId ? { ledgerEntityId: hit.ledgerEntityId } : {}),
        })),
        ...(filtered.length === 0 ? { note: "Nothing relevant found. Try other wording or the other language, or say the knowledge base has nothing on it." } : {}),
      });
    },
  });

  const businessSnapshotTool = defineTool({
    name: "business_snapshot",
    description:
      "One-call overview of a workspace for broad questions (\"how are we doing?\", \"what needs my attention?\"): this " +
      "month vs last month P&L, cash position, biggest supplier balances and overdue bills, low stock, best sellers, " +
      "and the factory's state.",
    inputSchema: z.object({ brand: brandCodeField }),
    run: async ({ brand: brandCode }) => {
      const brand = resolveBrand(ctx, brandCode);
      const [previous, current] = monthRanges(2);
      const [thisMonth, lastMonth, cash, entities, dashboard, factory, overdue] = await Promise.all([
        getFinanceSummary(brand.id, { from: current!.from, to: current!.to }),
        getFinanceSummary(brand.id, { from: previous!.from, to: previous!.to }),
        getCashFlowSummary(brand.id),
        listLedgerEntities(brand.id),
        getBrandDashboardSummary(brand.id),
        getFactoryDashboardSummary(),
        rows(sql`
          select e.name, t.amount, t.due_date from ledger_transactions t join ledger_entities e on e.id = t.entity_id
          where t.brand_id = ${brand.id} and t.kind in ('charge','opening_balance') and t.due_date < ${businessDate()}
          order by t.due_date limit 10`),
      ]);
      const month = (s: typeof thisMonth) => ({
        revenue: money(s.grossRevenue),
        expenses: money(s.totalExpenses),
        netProfit: money(s.netProfit),
        orders: s.orderCount,
      });
      return toolJson({
        workspace: brand.code,
        today: businessDate(),
        thisMonth: { period: `${current!.from}..${current!.to}`, ...month(thisMonth) },
        lastMonth: { period: `${previous!.from}..${previous!.to}`, ...month(lastMonth) },
        revenueChangePercent: percentChange(thisMonth.grossRevenue, lastMonth.grossRevenue),
        cash: { accountsPayable: money(cash.accountsPayable), accountsReceivable: money(cash.accountsReceivable), netCashFlow: money(cash.netCashFlow) },
        largestBalances: entities.slice(0, 5).map((entity) => ({ name: entity.name, type: entity.balanceType, remaining: money(entity.remainingBalance) })),
        // Bills with a due date in the past; a bill may be partly settled by later payments — check ledger statement.
        pastDueBills: overdue.map((row) => ({ supplier: row.name, amount: num(row.amount), due: row.due_date })),
        stock: {
          unitsOnHand: dashboard.inventoryUnitCount,
          valueAtCost: money(dashboard.inventoryValue),
          lowStockCount: dashboard.lowStockItems.length,
          lowStock: dashboard.lowStockItems.slice(0, 5).map((item) => ({ sku: item.sku, product: item.productName, stock: item.stock })),
          bestSellers: dashboard.topSellingItems.slice(0, 5).map((item) => ({ product: item.productName, sku: item.sku, sold: item.quantitySold })),
        },
        factory: {
          activeWorkOrders: factory.activeWorkOrders,
          materialsBelowReorder: factory.materialsBelowReorder,
          rawMaterialValue: money(factory.rawMaterialInventoryValue),
          finishedGoodsOnHand: factory.finishedGoodsOnHand,
          outputThisMonth: factory.monthGoodOutput,
          scrapThisMonth: factory.monthScrapOutput,
        },
      });
    },
  });

  const financeTool = defineTool({
    name: "finance",
    description:
      "Money for one workspace. view=summary: P&L over a date range (revenue from orders + recorded revenue, COGS, " +
      "shipping, expenses by category, net, margin; all time without dates). view=trend: the same month by month " +
      "for the last N months, for growth/comparison questions. view=expenses / view=revenues: individual entries with " +
      "totals, filtered by dates, category and words in the title/source/notes.",
    inputSchema: z.object({
      view: z.enum(["summary", "trend", "expenses", "revenues"]),
      brand: brandCodeField,
      ...range,
      months: z.coerce.number().int().min(2).max(12).optional().describe("trend: how many months (default 6), ending with `to`'s month"),
      expenseCategory: z.enum(EXPENSE_CATEGORIES).optional(),
      revenueCategory: z.enum(REVENUE_CATEGORIES).optional(),
      search: z.string().trim().max(100).optional().describe("expenses/revenues: words in title/source/notes"),
      limit,
    }),
    run: async ({ view, brand: brandCode, from, to, months, expenseCategory, revenueCategory, search, limit: rowLimit }) => {
      const brand = resolveBrand(ctx, brandCode);
      const matches = (texts: (string | null)[]) => !search || search.toLowerCase().split(/\s+/).every((word) => texts.some((text) => text?.toLowerCase().includes(word)));

      if (view === "summary") {
        return toolJson({ workspace: brand.code, range: { from: from ?? "all time", to: to ?? "today" }, currency: "EGP", ...(await financeSummary(brand, from, to)) });
      }
      if (view === "trend") {
        const periods = monthRanges(months ?? 6, to);
        const summaries = await Promise.all(periods.map((period) => getFinanceSummary(brand.id, { from: period.from, to: period.to })));
        const series = periods.map((period, index) => {
          const s = summaries[index]!;
          return {
            month: period.month,
            ...(period.partial ? { partial: `to ${period.to}` } : {}),
            revenue: money(s.grossRevenue),
            cogs: money(s.cogs),
            operatingExpenses: money(s.operatingExpenses),
            netProfit: money(s.netProfit),
            marginPercent: Math.round(s.profitMargin * 10) / 10,
            orders: s.orderCount,
            topExpenseCategory: Object.entries(s.byCategory).sort((a, b) => b[1] - a[1]).find(([, amount]) => amount > 0)?.[0] ?? null,
          };
        });
        const first = summaries[0]!;
        const last = summaries.at(-1)!;
        return toolJson({
          workspace: brand.code,
          currency: "EGP",
          series,
          revenueChangeFirstToLastPercent: percentChange(last.grossRevenue, first.grossRevenue),
          netProfitChangeFirstToLastPercent: percentChange(last.netProfit, first.netProfit),
        });
      }
      if (view === "expenses") {
        const all = (await listExpenses({ brandId: brand.id, from, to, category: expenseCategory })).filter((row) => matches([row.title, row.notes, row.ledgerEntityName]));
        return toolJson({
          workspace: brand.code,
          matchCount: all.length,
          total: money(all.reduce((sum, row) => sum + row.amount, 0)),
          currency: "EGP",
          expenses: all.slice(0, rowLimit ?? DEFAULT_LIMIT).map((row) => ({
            date: row.expenseDate,
            title: row.title,
            category: row.category,
            amount: row.amount,
            paymentMethod: row.paymentMethod,
            paidTo: row.ledgerEntityName,
            notes: row.notes,
          })),
        });
      }
      const all = (await listRevenues({ brandId: brand.id, from, to, category: revenueCategory })).filter((row) => matches([row.source, row.notes]));
      return toolJson({
        workspace: brand.code,
        note: "Recorded revenue only — order revenue is in view=summary.",
        matchCount: all.length,
        total: money(all.reduce((sum, row) => sum + row.amount, 0)),
        currency: "EGP",
        revenues: all.slice(0, rowLimit ?? DEFAULT_LIMIT).map((row) => ({ date: row.revenueDate, source: row.source, category: row.category, amount: row.amount, notes: row.notes })),
      });
    },
  });

  const ledgerTool = defineTool({
    name: "ledger",
    description:
      "Suppliers & debts ledger (suppliers, factories, couriers, clients). view=balances: entities with what's billed, " +
      "paid and remaining (filter by part of a name), plus total payable/receivable — gives the ledgerEntityId a draft " +
      "needs. view=statement: one entity's full history of bills, payments and due dates. payable = we owe them; " +
      "receivable = they owe us.",
    inputSchema: z.object({
      view: z.enum(["balances", "statement"]),
      brand: brandCodeField,
      name: z.string().trim().max(200).optional().describe("Part of the name (balances; or statement when the id isn't known)"),
      ledgerEntityId: z.string().trim().optional(),
      balanceType: z.enum(["payable", "receivable"]).optional(),
    }),
    run: async ({ view, brand: brandCode, name, ledgerEntityId, balanceType }) => {
      const brand = resolveBrand(ctx, brandCode);
      const entities = await listLedgerEntities(brand.id);
      const needle = name?.toLowerCase();
      const matching = entities.filter((entity) => (!needle || entity.name.toLowerCase().includes(needle)) && (!balanceType || entity.balanceType === balanceType));

      if (view === "balances") {
        const cash = await getCashFlowSummary(brand.id);
        return toolJson({
          workspace: brand.code,
          currency: "EGP",
          totalPayable: money(cash.accountsPayable),
          totalReceivable: money(cash.accountsReceivable),
          matchCount: matching.length,
          entities: matching.slice(0, 15).map((entity) => ({
            ledgerEntityId: entity.id,
            name: entity.name,
            category: entity.category,
            type: entity.balanceType,
            billed: money(entity.totalBilled),
            paid: money(entity.amountPaid),
            remaining: money(entity.remainingBalance),
          })),
          ...(matching.length === 0 && needle ? { note: "No name contains that text — try search_knowledge, which also matches other spellings and languages." } : {}),
        });
      }

      const target = ledgerEntityId ? entities.find((entity) => entity.id === ledgerEntityId) : matching.length === 1 ? matching[0] : undefined;
      if (!target) {
        throw new ToolInputError(
          matching.length > 1
            ? `Several entities match "${name}": ${matching.slice(0, 8).map((entity) => `${entity.name} (${entity.id})`).join(", ")}. Call again with one ledgerEntityId.`
            : "No such entity in this workspace — find it with view=balances or search_knowledge first.",
        );
      }
      const detail = await getLedgerEntityWithTransactions(target.id);
      const today = businessDate();
      return toolJson({
        workspace: brand.code,
        currency: "EGP",
        name: detail.name,
        type: detail.balanceType,
        category: detail.category,
        billed: money(detail.totalBilled),
        paid: money(detail.amountPaid),
        remaining: money(detail.remainingBalance),
        transactionCount: detail.transactions.length,
        transactions: detail.transactions.slice(0, 30).map((tx) => ({
          date: tx.transactionDate,
          kind: tx.kind,
          amount: tx.amount,
          ...(tx.dueDate ? { due: tx.dueDate, pastDue: tx.dueDate < today } : {}),
          notes: tx.notes,
          hasReceipt: Boolean(tx.receiptUrl),
        })),
      });
    },
  });

  const inventoryTool = defineTool({
    name: "inventory",
    description:
      "Stock for one workspace. view=overview: units and value on hand, best sellers, low stock. view=products: " +
      "variants matching words in product name, SKU or category, with stock, price, cost and units sold over " +
      "from/to (default: the last 30 days) — answers \"what's low and is it selling?\" in one call (lowStockOnly " +
      "for items at/below the low-stock threshold). view=movements: stock in/out over the last N days, totals by type " +
      "plus the latest moves, optionally for matching products only.",
    inputSchema: z.object({
      view: z.enum(["overview", "products", "movements"]),
      brand: brandCodeField,
      search: z.string().trim().max(100).optional().describe("Words in product name / SKU / category"),
      lowStockOnly: z.boolean().optional(),
      ...range,
      days: z.coerce.number().int().min(1).max(365).optional().describe("movements: look-back window (default 30)"),
    }),
    run: async ({ view, brand: brandCode, search, lowStockOnly, from, to, days }) => {
      const brand = resolveBrand(ctx, brandCode);
      if (view === "overview") {
        const summary = await getBrandDashboardSummary(brand.id);
        const item = (row: { sku: string; productName: string; color: string | null; size: string | null }) => ({ sku: row.sku, product: row.productName, color: row.color, size: row.size });
        return toolJson({
          workspace: brand.code,
          currency: "EGP",
          unitsOnHand: summary.inventoryUnitCount,
          stockValueAtCost: money(summary.inventoryValue),
          stockValueAtRetail: money(summary.potentialRetailValue),
          topSellingAllTime: summary.topSellingItems.slice(0, 10).map((row) => ({ ...item(row), quantitySold: row.quantitySold, revenue: money(row.revenue) })),
          lowStock: summary.lowStockItems.slice(0, 25).map((row) => ({ ...item(row), stock: row.stock })),
          lowStockCount: summary.lowStockItems.length,
        });
      }

      const match = termsCondition(search, [sql`p.name`, sql`v.sku`, sql`c.name`]);
      if (view === "products") {
        const { lowStockThreshold } = await getSettings();
        const soldTo = to ?? businessDate();
        const soldFrom = from ?? new Date(new Date(`${soldTo}T00:00:00Z`).getTime() - 29 * 86_400_000).toISOString().slice(0, 10);
        const orderDay = sql`(o.order_date at time zone 'Africa/Cairo')::date`;
        const list = await rows(sql`
          select * from (
            select p.name as product, c.name as category, p.status, v.sku,
              (select string_agg(av.value, ' / ' order by a.name) from variant_attribute_values vav
                 join attribute_values av on av.id = vav.attribute_value_id join attributes a on a.id = av.attribute_id
                 where vav.variant_id = v.id) as options,
              coalesce((select sum(i.quantity) from inventory i where i.variant_id = v.id), 0)::int as stock,
              (select pr.price from variant_prices pr where pr.variant_id = v.id and pr.effective_to is null order by pr.effective_from desc limit 1) as price,
              (select vc.cost from variant_costs vc where vc.variant_id = v.id and vc.effective_to is null order by vc.effective_from desc limit 1) as cost,
              coalesce((select sum(i.quantity) from order_items i join orders o on o.id = i.order_id
                 where i.variant_id = v.id and o.status <> 'cancelled' and ${orderDay} between ${soldFrom} and ${soldTo}), 0)::int as sold
            from product_variants v join products p on p.id = v.product_id join categories c on c.id = p.category_id
            where p.brand_id = ${brand.id} and ${match}
          ) x where ${lowStockOnly ? sql`x.stock <= ${lowStockThreshold}` : sql`true`}
          order by x.product, x.sku limit 61`);
        return toolJson({
          workspace: brand.code,
          lowStockThreshold,
          soldBetween: `${soldFrom}..${soldTo}`,
          ...(list.length > 60 ? { note: "More than 60 variants match — narrow the search." } : {}),
          variants: list.slice(0, 60).map((row) => ({
            product: row.product,
            sku: row.sku,
            options: row.options,
            stock: row.stock,
            sold: row.sold,
            price: row.price === null ? null : num(row.price),
            cost: row.cost === null ? null : num(row.cost),
            ...(row.status !== "active" ? { status: row.status } : {}),
          })),
          ...(list.length === 0 ? { note: "No variant matches those words — product names may be in another language; search_knowledge can find them." } : {}),
        });
      }

      const window = days ?? 30;
      const scope = sql`p.brand_id = ${brand.id} and m.created_at >= now() - make_interval(days => ${window}) and ${match}`;
      const [totals, latest] = await Promise.all([
        rows(sql`
          select m.movement_type as type, count(*)::int as moves, sum(m.quantity)::int as units
          from stock_movements m join product_variants v on v.id = m.variant_id join products p on p.id = v.product_id join categories c on c.id = p.category_id
          where ${scope} group by m.movement_type order by units desc`),
        rows(sql`
          select m.created_at, m.movement_type as type, m.quantity, v.sku, p.name as product, m.notes
          from stock_movements m join product_variants v on v.id = m.variant_id join products p on p.id = v.product_id join categories c on c.id = p.category_id
          where ${scope} order by m.created_at desc limit 20`),
      ]);
      return toolJson({
        workspace: brand.code,
        days: window,
        totalsByType: totals,
        latest: latest.map((row) => ({ date: new Date(row.created_at as string).toISOString().slice(0, 10), type: row.type, qty: row.quantity, sku: row.sku, product: row.product, notes: row.notes })),
      });
    },
  });

  const ordersTool = defineTool({
    name: "orders",
    description:
      "Customer orders for one workspace. view=summary: counts and revenue by status, average order value and top " +
      "products over a date range. view=list: orders newest first (filter by status, dates, customer or order number " +
      "words). view=detail: one order's items, by its order number.",
    inputSchema: z.object({
      view: z.enum(["summary", "list", "detail"]),
      brand: brandCodeField,
      ...range,
      status: z.enum(["pending", "processing", "shipped", "delivered", "cancelled"]).optional(),
      search: z.string().trim().max(100).optional().describe("list: words in customer name or order number"),
      orderNumber: z.string().trim().max(50).optional(),
      limit,
    }),
    run: async ({ view, brand: brandCode, from, to, status, search, orderNumber, limit: rowLimit }) => {
      const brand = resolveBrand(ctx, brandCode);
      const day = sql`(o.order_date at time zone 'Africa/Cairo')::date`;
      const scope = sql`o.brand_id = ${brand.id}
        ${from ? sql`and ${day} >= ${from}` : sql``} ${to ? sql`and ${day} <= ${to}` : sql``}
        ${status ? sql`and o.status = ${status}` : sql``}`;
      const totalOf = sql`coalesce((select sum(i.subtotal) from order_items i where i.order_id = o.id), 0)`;

      if (view === "summary") {
        const [byStatus, top] = await Promise.all([
          rows(sql`select o.status, count(*)::int as orders, sum(${totalOf}) as revenue from orders o where ${scope} group by o.status order by orders desc`),
          rows(sql`
            select p.name as product, sum(i.quantity)::int as units, sum(i.subtotal) as revenue
            from order_items i join orders o on o.id = i.order_id join product_variants v on v.id = i.variant_id join products p on p.id = v.product_id
            where ${scope} and o.status <> 'cancelled' group by p.name order by units desc limit 8`),
        ]);
        const live = byStatus.filter((row) => row.status !== "cancelled");
        const orders = live.reduce((sum, row) => sum + Number(row.orders), 0);
        const revenue = live.reduce((sum, row) => sum + Number(row.revenue ?? 0), 0);
        return toolJson({
          workspace: brand.code,
          range: { from: from ?? "all time", to: to ?? "today" },
          currency: "EGP",
          byStatus: byStatus.map((row) => ({ status: row.status, orders: row.orders, itemsValue: num(row.revenue) })),
          ordersExcludingCancelled: orders,
          itemsRevenueExcludingCancelled: money(revenue),
          averageOrderValue: orders ? money(revenue / orders) : 0,
          topProducts: top.map((row) => ({ product: row.product, units: row.units, revenue: num(row.revenue) })),
        });
      }
      if (view === "detail") {
        if (!orderNumber) throw new ToolInputError("view=detail needs orderNumber — find it with view=list.");
        const [order] = await rows(sql`select o.id, o.order_number, o.status, o.customer_name, o.payment_method, o.shipping_fee, o.order_date from orders o where o.brand_id = ${brand.id} and o.order_number ilike ${orderNumber}`);
        if (!order) throw new ToolInputError(`No order ${orderNumber} in ${brand.code}.`);
        const items = await rows(sql`
          select p.name as product, v.sku, i.quantity, i.unit_price_at_sale, i.cost_at_sale, i.subtotal
          from order_items i join product_variants v on v.id = i.variant_id join products p on p.id = v.product_id where i.order_id = ${order.id}`);
        return toolJson({
          orderNumber: order.order_number,
          status: order.status,
          customer: order.customer_name,
          payment: order.payment_method,
          date: new Date(order.order_date as string).toISOString().slice(0, 10),
          shippingFee: num(order.shipping_fee),
          items: items.map((row) => ({ product: row.product, sku: row.sku, qty: row.quantity, unitPrice: num(row.unit_price_at_sale), unitCost: num(row.cost_at_sale), subtotal: num(row.subtotal) })),
          itemsTotal: money(items.reduce((sum, row) => sum + Number(row.subtotal), 0)),
        });
      }
      const list = await rows(sql`
        select o.order_number, o.status, o.customer_name, o.order_date, ${totalOf} as total,
          (select count(*) from order_items i where i.order_id = o.id)::int as items
        from orders o where ${scope} and ${termsCondition(search, [sql`o.customer_name`, sql`o.order_number`])}
        order by o.order_date desc limit ${rowLimit ?? DEFAULT_LIMIT}`);
      return toolJson({
        workspace: brand.code,
        orders: list.map((row) => ({ orderNumber: row.order_number, status: row.status, customer: row.customer_name, date: new Date(row.order_date as string).toISOString().slice(0, 10), items: row.items, total: num(row.total) })),
      });
    },
  });

  const factoryTool = defineTool({
    name: "factory",
    description:
      "The factory (shared by all brands). view=overview: active work orders, materials below reorder level, raw " +
      "material value, finished goods, this month's output and scrap. view=work_orders: work orders (filter by status) " +
      "with progress. view=materials: material requirements vs stock for open work orders, with shortfalls (MRP). " +
      "view=scrap: scrap rates by reason and product.",
    inputSchema: z.object({
      view: z.enum(["overview", "work_orders", "materials", "scrap"]),
      status: z.enum(["draft", "scheduled", "in_progress", "paused", "completed", "cancelled"]).optional(),
    }),
    run: async ({ view, status }) => {
      if (view === "overview") {
        const summary = await getFactoryDashboardSummary();
        return toolJson({ ...summary, rawMaterialInventoryValue: money(summary.rawMaterialInventoryValue), currency: "EGP" });
      }
      if (view === "work_orders") {
        const list = await listWorkOrders(status);
        return toolJson({
          count: list.length,
          workOrders: list.slice(0, 30).map((wo) => ({
            orderNumber: wo.orderNumber,
            product: wo.finishedGoodName,
            status: wo.status,
            priority: wo.priority,
            ordered: Number(wo.quantityOrdered),
            completed: Number(wo.quantityCompleted),
            scrapped: Number(wo.quantityScrapped),
            plannedEnd: wo.plannedEndDate,
          })),
        });
      }
      if (view === "materials") {
        const report = await getMrpReport();
        return toolJson({
          materials: report.slice(0, 40).map((row) => ({
            material: row.materialName,
            sku: row.sku,
            unit: row.unit,
            required: row.totalRequired,
            available: row.availableQuantity,
            shortfall: row.shortfall,
            reorderLevel: row.reorderLevel,
            openWorkOrders: row.openWorkOrderCount,
          })),
        });
      }
      const scrap = await getScrapReport();
      return toolJson({ ...scrap, byProduct: scrap.byProduct.slice(0, 15), materialWaste: scrap.materialWaste.slice(0, 15) });
    },
  });

  return [searchKnowledgeTool, businessSnapshotTool, financeTool, ledgerTool, inventoryTool, ordersTool, factoryTool];
}
