import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import {
  attributeValues,
  attributes,
  brands,
  categories,
  inventory,
  orderItems,
  orders,
  productVariants,
  products,
  stockMovements,
  variantAttributeValues,
  variantPrices,
} from "../../db/schema/index.js";
import { ApiError } from "../../utils/apiError.js";
import { getSettings } from "../settings/settings.service.js";

export interface BrandSummary {
  id: string;
  name: string;
  code: string;
  revenue: number;
  orderCount: number;
  inventoryValue: number;
  inventoryUnitCount: number;
  /** Production cost (COGS) + shipping fees across this brand's non-cancelled orders. */
  totalExpenses: number;
  /** revenue - totalExpenses. */
  netProfit: number;
  /** netProfit / revenue * 100, or 0 when revenue is 0. */
  profitMargin: number;
}

export interface DashboardTotals {
  revenue: number;
  orderCount: number;
  inventoryValue: number;
  inventoryUnitCount: number;
  totalExpenses: number;
  netProfit: number;
  profitMargin: number;
}

export interface RecentMovement {
  id: string;
  movementType: string;
  quantity: number;
  createdAt: Date;
  sku: string;
  productName: string;
  brand: { id: string; name: string; code: string };
}

export interface DashboardSummary {
  brands: BrandSummary[];
  totals: DashboardTotals;
  recentMovements: RecentMovement[];
  activeBrandCount: number;
}

/**
 * Aggregates revenue, inventory value/count, and recent activity across
 * BOTH brands for the Master Executive Dashboard — the one view that
 * deliberately breaks the single-workspace brand isolation the rest of the
 * app enforces, so it's admin-only (gated in the route, not just the UI).
 */
export async function getDashboardSummary(): Promise<DashboardSummary> {
  const allBrands = await db.select().from(brands).orderBy(brands.name);

  // Revenue + order count + production cost (COGS) per brand, excluding
  // cancelled orders — a cancelled order was never actually fulfilled
  // revenue (or cost). COGS uses each item's costAtSale snapshot, not the
  // variant's current cost, so it stays accurate even after a cost change.
  const revenueRows = await db
    .select({
      brandId: products.brandId,
      revenue: sql<string>`coalesce(sum(${orderItems.subtotal}), 0)`,
      orderCount: sql<number>`count(distinct ${orders.id})::int`,
      cogs: sql<string>`coalesce(sum(${orderItems.quantity} * ${orderItems.costAtSale}), 0)`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .innerJoin(productVariants, eq(productVariants.id, orderItems.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(ne(orders.status, "cancelled"))
    .groupBy(products.brandId);

  // Shipping fees per brand — a plain column on `orders`, so no join needed
  // (unlike revenue/cogs, which live on order_items).
  const shippingRows = await db
    .select({
      brandId: orders.brandId,
      shippingFee: sql<string>`coalesce(sum(${orders.shippingFee}), 0)`,
    })
    .from(orders)
    .where(ne(orders.status, "cancelled"))
    .groupBy(orders.brandId);

  // On-hand unit count + inventory value (qty * current active price) per
  // brand. LEFT JOIN variant_prices because a variant with no active price
  // should still count its units, just contribute 0 to value.
  const inventoryRows = await db
    .select({
      brandId: products.brandId,
      unitCount: sql<number>`coalesce(sum(${inventory.quantity}), 0)::int`,
      inventoryValue: sql<string>`coalesce(sum(${inventory.quantity} * coalesce(${variantPrices.price}, 0)), 0)`,
    })
    .from(inventory)
    .innerJoin(productVariants, eq(productVariants.id, inventory.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(
      variantPrices,
      and(eq(variantPrices.variantId, productVariants.id), isNull(variantPrices.effectiveTo)),
    )
    .groupBy(products.brandId);

  const revenueByBrand = new Map(revenueRows.map((r) => [r.brandId, r]));
  const inventoryByBrand = new Map(inventoryRows.map((r) => [r.brandId, r]));
  const shippingByBrand = new Map(shippingRows.map((r) => [r.brandId, r]));

  const brandSummaries: BrandSummary[] = allBrands.map((b) => {
    const rev = revenueByBrand.get(b.id);
    const inv = inventoryByBrand.get(b.id);
    const revenue = rev ? Number(rev.revenue) : 0;
    const cogs = rev ? Number(rev.cogs) : 0;
    const shippingFee = shippingByBrand.get(b.id) ? Number(shippingByBrand.get(b.id)!.shippingFee) : 0;
    const totalExpenses = cogs + shippingFee;
    const netProfit = revenue - totalExpenses;
    return {
      id: b.id,
      name: b.name,
      code: b.code,
      revenue,
      orderCount: rev?.orderCount ?? 0,
      inventoryValue: inv ? Number(inv.inventoryValue) : 0,
      inventoryUnitCount: inv?.unitCount ?? 0,
      totalExpenses,
      netProfit,
      profitMargin: revenue > 0 ? (netProfit / revenue) * 100 : 0,
    };
  });

  const rawTotals = brandSummaries.reduce(
    (acc, b) => ({
      revenue: acc.revenue + b.revenue,
      orderCount: acc.orderCount + b.orderCount,
      inventoryValue: acc.inventoryValue + b.inventoryValue,
      inventoryUnitCount: acc.inventoryUnitCount + b.inventoryUnitCount,
      totalExpenses: acc.totalExpenses + b.totalExpenses,
      netProfit: acc.netProfit + b.netProfit,
    }),
    { revenue: 0, orderCount: 0, inventoryValue: 0, inventoryUnitCount: 0, totalExpenses: 0, netProfit: 0 },
  );
  // Margin is derived from the summed totals, not averaged/summed across
  // brands' individual margins (which wouldn't be a meaningful percentage).
  const totals: DashboardTotals = {
    ...rawTotals,
    profitMargin: rawTotals.revenue > 0 ? (rawTotals.netProfit / rawTotals.revenue) * 100 : 0,
  };

  const recentMovementRows = await db
    .select({
      id: stockMovements.id,
      movementType: stockMovements.movementType,
      quantity: stockMovements.quantity,
      createdAt: stockMovements.createdAt,
      sku: productVariants.sku,
      productName: products.name,
      brandId: brands.id,
      brandName: brands.name,
      brandCode: brands.code,
    })
    .from(stockMovements)
    .innerJoin(productVariants, eq(productVariants.id, stockMovements.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .innerJoin(brands, eq(brands.id, products.brandId))
    .orderBy(desc(stockMovements.createdAt))
    .limit(20);

  const recentMovements: RecentMovement[] = recentMovementRows.map((m) => ({
    id: m.id,
    movementType: m.movementType,
    quantity: m.quantity,
    createdAt: m.createdAt,
    sku: m.sku,
    productName: m.productName,
    brand: { id: m.brandId, name: m.brandName, code: m.brandCode },
  }));

  const activeBrandCount = allBrands.filter((b) => b.isActive).length;

  return { brands: brandSummaries, totals, recentMovements, activeBrandCount };
}

const TOP_SELLING_LIMIT = 10;
const TOP_STOCKED_LIMIT = 10;
const LOW_STOCK_LIMIT = 20;
const RECENT_MOVEMENTS_LIMIT = 20;
const TREND_DAYS = 7;

export interface TopSellingItem {
  variantId: string;
  sku: string;
  productName: string;
  color: string | null;
  size: string | null;
  quantitySold: number;
  revenue: number;
}

export interface LowStockItem {
  variantId: string;
  sku: string;
  productName: string;
  color: string | null;
  size: string | null;
  stock: number;
}

export interface BrandRecentMovement {
  id: string;
  movementType: string;
  quantity: number;
  createdAt: Date;
  sku: string;
  productName: string;
}

export interface TopStockedItem {
  variantId: string;
  sku: string;
  productName: string;
  color: string | null;
  size: string | null;
  stock: number;
}

export interface CategoryValueItem {
  categoryId: string;
  categoryName: string;
  inventoryValue: number;
}

/** One point per day (oldest first) — powers each KPI card's sparkline. inventoryUnits/inventoryValue are end-of-day absolute levels (reconstructed by walking the daily net change backward from today's real total); revenue/orderCount/expenses/netProfit are that day's own totals, not cumulative. */
export interface DashboardTrendPoint {
  day: string;
  revenue: number;
  orderCount: number;
  inventoryUnits: number;
  inventoryValue: number;
  /** That day's production cost (COGS) + shipping fees. */
  expenses: number;
  /** That day's revenue - expenses. */
  netProfit: number;
}

export interface BrandDashboardSummary {
  brand: { id: string; name: string; code: string };
  revenue: number;
  orderCount: number;
  inventoryValue: number;
  inventoryUnitCount: number;
  totalExpenses: number;
  netProfit: number;
  profitMargin: number;
  topSellingItems: TopSellingItem[];
  topStockedItems: TopStockedItem[];
  lowStockItems: LowStockItem[];
  categoryBreakdown: CategoryValueItem[];
  recentMovements: BrandRecentMovement[];
  trend: DashboardTrendPoint[];
}

/** Batch-fetches color/size for a set of variants — mirrors the pattern in products.service.ts's listProductsWithVariants, kept local here since dashboard rows are aggregated (GROUP BY) and can't carry the one-to-many attribute join directly. */
async function attributesForVariants(variantIds: string[]): Promise<Map<string, { color: string | null; size: string | null }>> {
  if (variantIds.length === 0) return new Map();

  const rows = await db
    .select({
      variantId: variantAttributeValues.variantId,
      attributeName: attributes.name,
      value: attributeValues.value,
    })
    .from(variantAttributeValues)
    .innerJoin(attributeValues, eq(attributeValues.id, variantAttributeValues.attributeValueId))
    .innerJoin(attributes, eq(attributes.id, attributeValues.attributeId))
    .where(inArray(variantAttributeValues.variantId, variantIds));

  const map = new Map<string, { color: string | null; size: string | null }>();
  for (const row of rows) {
    const entry = map.get(row.variantId) ?? { color: null, size: null };
    const attributeName = row.attributeName.toLowerCase();
    if (attributeName === "color") entry.color = row.value;
    if (attributeName === "size") entry.size = row.value;
    map.set(row.variantId, entry);
  }
  return map;
}

interface DailyOrdersRow {
  day: string;
  revenue: string;
  order_count: number;
  cogs: string;
  shipping_fee: string;
  [key: string]: unknown;
}

interface DailyMovementsRow {
  day: string;
  net_units: number;
  net_value: string;
  [key: string]: unknown;
}

/**
 * Builds the last TREND_DAYS days' (revenue, orderCount) and (net unit
 * change, net value change) for one brand, gap-filled via generate_series
 * so every day appears even with zero activity. net_units/net_value are
 * signed daily deltas — to_bin_id set contributes +quantity, from_bin_id
 * set contributes -quantity, so a transfer row (both set) nets to 0 for the
 * brand's total on-hand, exactly as it should (stock moved bins, didn't
 * leave or enter the brand's total).
 */
async function getDailyActivity(brandId: string): Promise<{ orders: DailyOrdersRow[]; movements: DailyMovementsRow[] }> {
  const daySpan = TREND_DAYS - 1;

  const ordersResult = await db.execute<DailyOrdersRow>(sql`
    select gs.day::date as day,
           coalesce(sum(oi.subtotal), 0) as revenue,
           coalesce(count(distinct o.id), 0)::int as order_count,
           coalesce(sum(oi.quantity * oi.cost_at_sale), 0) as cogs,
           coalesce(sf.shipping_fee, 0) as shipping_fee
    from generate_series((current_date - ${daySpan} * interval '1 day')::date, current_date::date, interval '1 day') as gs(day)
    left join orders o on o.brand_id = ${brandId} and o.status != 'cancelled' and o.order_date::date = gs.day
    left join order_items oi on oi.order_id = o.id
    left join (
      -- Shipping fee is a per-order column, so it must be pre-aggregated by
      -- day here — summing o.shipping_fee directly in the outer query would
      -- double-count it once per order_items row.
      select o2.order_date::date as day, sum(o2.shipping_fee) as shipping_fee
      from orders o2
      where o2.brand_id = ${brandId} and o2.status != 'cancelled'
      group by o2.order_date::date
    ) sf on sf.day = gs.day
    group by gs.day, sf.shipping_fee
    order by gs.day
  `);

  const movementsResult = await db.execute<DailyMovementsRow>(sql`
    select gs.day::date as day,
           coalesce(agg.net_units, 0)::int as net_units,
           coalesce(agg.net_value, 0) as net_value
    from generate_series((current_date - ${daySpan} * interval '1 day')::date, current_date::date, interval '1 day') as gs(day)
    left join (
      select sm.created_at::date as day,
             sum((case when sm.to_bin_id is not null then sm.quantity else 0 end) -
                 (case when sm.from_bin_id is not null then sm.quantity else 0 end)) as net_units,
             sum(((case when sm.to_bin_id is not null then sm.quantity else 0 end) -
                  (case when sm.from_bin_id is not null then sm.quantity else 0 end)) * coalesce(vp.price, 0)) as net_value
      from stock_movements sm
      join product_variants pv on pv.id = sm.variant_id
      join products p on p.id = pv.product_id
      left join variant_prices vp on vp.variant_id = pv.id and vp.effective_to is null
      where p.brand_id = ${brandId} and sm.created_at >= current_date - ${daySpan} * interval '1 day'
      group by sm.created_at::date
    ) agg on agg.day = gs.day
    order by gs.day
  `);

  return { orders: ordersResult.rows, movements: movementsResult.rows };
}

/**
 * Brand-specific analytics for the /[brand]/dashboard page: revenue,
 * inventory value, top sellers, top-stocked variants, category breakdown,
 * low-stock warnings, and a 7-day trend scoped to this one brand — unlike
 * getDashboardSummary above, this respects normal brand isolation
 * (reachable by warehouse_staff for their own brand, via requireBrandAccess
 * on the route).
 */
export async function getBrandDashboardSummary(brandId: string): Promise<BrandDashboardSummary> {
  const [brand] = await db.select({ id: brands.id, name: brands.name, code: brands.code }).from(brands).where(eq(brands.id, brandId)).limit(1);
  if (!brand) throw ApiError.notFound(`Brand ${brandId} does not exist`);

  // Settings page's "Inventory & Operations" tab — the Low Stock threshold used below.
  const { lowStockThreshold } = await getSettings();

  const [revenueRow] = await db
    .select({
      revenue: sql<string>`coalesce(sum(${orderItems.subtotal}), 0)`,
      orderCount: sql<number>`count(distinct ${orders.id})::int`,
      cogs: sql<string>`coalesce(sum(${orderItems.quantity} * ${orderItems.costAtSale}), 0)`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .innerJoin(productVariants, eq(productVariants.id, orderItems.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(and(eq(products.brandId, brandId), ne(orders.status, "cancelled")));

  const [shippingRow] = await db
    .select({ shippingFee: sql<string>`coalesce(sum(${orders.shippingFee}), 0)` })
    .from(orders)
    .where(and(eq(orders.brandId, brandId), ne(orders.status, "cancelled")));

  const [inventoryRow] = await db
    .select({
      unitCount: sql<number>`coalesce(sum(${inventory.quantity}), 0)::int`,
      inventoryValue: sql<string>`coalesce(sum(${inventory.quantity} * coalesce(${variantPrices.price}, 0)), 0)`,
    })
    .from(inventory)
    .innerJoin(productVariants, eq(productVariants.id, inventory.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(variantPrices, and(eq(variantPrices.variantId, productVariants.id), isNull(variantPrices.effectiveTo)))
    .where(eq(products.brandId, brandId));

  const topSellingRows = await db
    .select({
      variantId: productVariants.id,
      sku: productVariants.sku,
      productName: products.name,
      quantitySold: sql<number>`coalesce(sum(${orderItems.quantity}), 0)::int`,
      revenue: sql<string>`coalesce(sum(${orderItems.subtotal}), 0)`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .innerJoin(productVariants, eq(productVariants.id, orderItems.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(and(eq(products.brandId, brandId), ne(orders.status, "cancelled")))
    .groupBy(productVariants.id, productVariants.sku, products.name)
    .orderBy(desc(sql`coalesce(sum(${orderItems.quantity}), 0)`))
    .limit(TOP_SELLING_LIMIT);

  // LEFT JOIN inventory: a variant with zero rows there (never stocked) is
  // exactly as "low stock" as one explicitly at 0, so it must still surface here.
  const lowStockRows = await db
    .select({
      variantId: productVariants.id,
      sku: productVariants.sku,
      productName: products.name,
      stock: sql<number>`coalesce(sum(${inventory.quantity}), 0)::int`,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
    .where(and(eq(products.brandId, brandId), eq(productVariants.status, "active")))
    .groupBy(productVariants.id, productVariants.sku, products.name)
    .having(sql`coalesce(sum(${inventory.quantity}), 0) <= ${lowStockThreshold}`)
    .orderBy(sql`coalesce(sum(${inventory.quantity}), 0) asc`)
    .limit(LOW_STOCK_LIMIT);

  // Same shape as lowStockRows but the opposite ends of the sort — the
  // "Top Stocked Variants" chart, not "what needs reordering."
  const topStockedRows = await db
    .select({
      variantId: productVariants.id,
      sku: productVariants.sku,
      productName: products.name,
      stock: sql<number>`coalesce(sum(${inventory.quantity}), 0)::int`,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
    .where(and(eq(products.brandId, brandId), eq(productVariants.status, "active")))
    .groupBy(productVariants.id, productVariants.sku, products.name)
    .having(sql`coalesce(sum(${inventory.quantity}), 0) > 0`)
    .orderBy(sql`coalesce(sum(${inventory.quantity}), 0) desc`)
    .limit(TOP_STOCKED_LIMIT);

  const categoryBreakdownRows = await db
    .select({
      categoryId: categories.id,
      categoryName: categories.name,
      inventoryValue: sql<string>`coalesce(sum(${inventory.quantity} * coalesce(${variantPrices.price}, 0)), 0)`,
    })
    .from(inventory)
    .innerJoin(productVariants, eq(productVariants.id, inventory.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .leftJoin(variantPrices, and(eq(variantPrices.variantId, productVariants.id), isNull(variantPrices.effectiveTo)))
    .where(eq(products.brandId, brandId))
    .groupBy(categories.id, categories.name)
    .orderBy(desc(sql`sum(${inventory.quantity} * coalesce(${variantPrices.price}, 0))`));

  const attributeMap = await attributesForVariants([
    ...topSellingRows.map((r) => r.variantId),
    ...lowStockRows.map((r) => r.variantId),
    ...topStockedRows.map((r) => r.variantId),
  ]);

  const topSellingItems: TopSellingItem[] = topSellingRows.map((r) => ({
    variantId: r.variantId,
    sku: r.sku,
    productName: r.productName,
    color: attributeMap.get(r.variantId)?.color ?? null,
    size: attributeMap.get(r.variantId)?.size ?? null,
    quantitySold: r.quantitySold,
    revenue: Number(r.revenue),
  }));

  const lowStockItems: LowStockItem[] = lowStockRows.map((r) => ({
    variantId: r.variantId,
    sku: r.sku,
    productName: r.productName,
    color: attributeMap.get(r.variantId)?.color ?? null,
    size: attributeMap.get(r.variantId)?.size ?? null,
    stock: r.stock,
  }));

  const topStockedItems: TopStockedItem[] = topStockedRows.map((r) => ({
    variantId: r.variantId,
    sku: r.sku,
    productName: r.productName,
    color: attributeMap.get(r.variantId)?.color ?? null,
    size: attributeMap.get(r.variantId)?.size ?? null,
    stock: r.stock,
  }));

  const categoryBreakdown: CategoryValueItem[] = categoryBreakdownRows.map((r) => ({
    categoryId: r.categoryId,
    categoryName: r.categoryName,
    inventoryValue: Number(r.inventoryValue),
  }));

  const currentInventoryUnitCount = inventoryRow?.unitCount ?? 0;
  const currentInventoryValue = inventoryRow ? Number(inventoryRow.inventoryValue) : 0;

  const { orders: dailyOrders, movements: dailyMovements } = await getDailyActivity(brandId);

  // Reconstruct each day's END-OF-DAY absolute level by walking backward
  // from today's real total, undoing one day's net delta at a time — see
  // getDailyActivity's doc comment for why net_units/net_value are safe to
  // treat as exact deltas.
  let runningUnits = currentInventoryUnitCount;
  let runningValue = currentInventoryValue;
  const unitLevels: number[] = new Array(dailyMovements.length);
  const valueLevels: number[] = new Array(dailyMovements.length);
  for (let i = dailyMovements.length - 1; i >= 0; i--) {
    unitLevels[i] = runningUnits;
    valueLevels[i] = runningValue;
    runningUnits -= dailyMovements[i]!.net_units;
    runningValue -= Number(dailyMovements[i]!.net_value);
  }

  const trend: DashboardTrendPoint[] = dailyOrders.map((row, i) => {
    const dayRevenue = Number(row.revenue);
    const dayExpenses = Number(row.cogs) + Number(row.shipping_fee);
    return {
      day: row.day,
      revenue: dayRevenue,
      orderCount: row.order_count,
      inventoryUnits: unitLevels[i] ?? currentInventoryUnitCount,
      inventoryValue: valueLevels[i] ?? currentInventoryValue,
      expenses: dayExpenses,
      netProfit: dayRevenue - dayExpenses,
    };
  });

  const recentMovementRows = await db
    .select({
      id: stockMovements.id,
      movementType: stockMovements.movementType,
      quantity: stockMovements.quantity,
      createdAt: stockMovements.createdAt,
      sku: productVariants.sku,
      productName: products.name,
    })
    .from(stockMovements)
    .innerJoin(productVariants, eq(productVariants.id, stockMovements.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(eq(products.brandId, brandId))
    .orderBy(desc(stockMovements.createdAt))
    .limit(RECENT_MOVEMENTS_LIMIT);

  const revenue = revenueRow ? Number(revenueRow.revenue) : 0;
  const cogs = revenueRow ? Number(revenueRow.cogs) : 0;
  const shippingFee = shippingRow ? Number(shippingRow.shippingFee) : 0;
  const totalExpenses = cogs + shippingFee;
  const netProfit = revenue - totalExpenses;

  return {
    brand,
    revenue,
    orderCount: revenueRow?.orderCount ?? 0,
    inventoryValue: currentInventoryValue,
    inventoryUnitCount: currentInventoryUnitCount,
    totalExpenses,
    netProfit,
    profitMargin: revenue > 0 ? (netProfit / revenue) * 100 : 0,
    topSellingItems,
    topStockedItems,
    lowStockItems,
    categoryBreakdown,
    recentMovements: recentMovementRows,
    trend,
  };
}
