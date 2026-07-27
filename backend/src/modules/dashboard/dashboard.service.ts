import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import {
  brands,
  inventory,
  orderItems,
  orders,
  productVariants,
  products,
  stockMovements,
  variantPrices,
} from "../../db/schema/index.js";

export interface BrandSummary {
  id: string;
  name: string;
  code: string;
  revenue: number;
  orderCount: number;
  inventoryValue: number;
  inventoryUnitCount: number;
}

export interface DashboardTotals {
  revenue: number;
  orderCount: number;
  inventoryValue: number;
  inventoryUnitCount: number;
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
}

/**
 * Aggregates revenue, inventory value/count, and recent activity across
 * BOTH brands for the Master Executive Dashboard — the one view that
 * deliberately breaks the single-workspace brand isolation the rest of the
 * app enforces, so it's admin-only (gated in the route, not just the UI).
 */
export async function getDashboardSummary(): Promise<DashboardSummary> {
  const allBrands = await db.select().from(brands).orderBy(brands.name);

  // Revenue + order count per brand, excluding cancelled orders — a
  // cancelled order was never actually fulfilled revenue.
  const revenueRows = await db
    .select({
      brandId: products.brandId,
      revenue: sql<string>`coalesce(sum(${orderItems.subtotal}), 0)`,
      orderCount: sql<number>`count(distinct ${orders.id})::int`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .innerJoin(productVariants, eq(productVariants.id, orderItems.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(ne(orders.status, "cancelled"))
    .groupBy(products.brandId);

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

  const brandSummaries: BrandSummary[] = allBrands.map((b) => {
    const rev = revenueByBrand.get(b.id);
    const inv = inventoryByBrand.get(b.id);
    return {
      id: b.id,
      name: b.name,
      code: b.code,
      revenue: rev ? Number(rev.revenue) : 0,
      orderCount: rev?.orderCount ?? 0,
      inventoryValue: inv ? Number(inv.inventoryValue) : 0,
      inventoryUnitCount: inv?.unitCount ?? 0,
    };
  });

  const totals: DashboardTotals = brandSummaries.reduce(
    (acc, b) => ({
      revenue: acc.revenue + b.revenue,
      orderCount: acc.orderCount + b.orderCount,
      inventoryValue: acc.inventoryValue + b.inventoryValue,
      inventoryUnitCount: acc.inventoryUnitCount + b.inventoryUnitCount,
    }),
    { revenue: 0, orderCount: 0, inventoryValue: 0, inventoryUnitCount: 0 },
  );

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

  return { brands: brandSummaries, totals, recentMovements };
}
