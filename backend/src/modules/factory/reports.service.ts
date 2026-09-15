import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import {
  finishedGoods,
  laborLogs,
  materialStock,
  materialStockMovements,
  productionOutputLogs,
  rawMaterials,
  workOrders,
} from "../../db/schema/index.js";
import { computeMaterialRequirements } from "./boms.service.js";

const OPEN_WORK_ORDER_STATUSES = ["draft", "scheduled", "in_progress", "paused"] as const;

export interface MrpReportRow {
  materialId: string;
  materialName: string;
  sku: string;
  unit: string;
  totalRequired: number;
  availableQuantity: number;
  shortfall: number;
  reorderLevel: number;
  openWorkOrderCount: number;
}

/**
 * Aggregate MRP across every open work order — the per-BOM MRP on a single
 * order's detail page (computeMaterialRequirements) answers "what does this
 * order need"; this answers "what does the whole shop floor need right now",
 * summed by material, for purchasing to act on. Still fully derived, nothing
 * stored.
 */
export async function getMrpReport(): Promise<MrpReportRow[]> {
  const openOrders = await db
    .select({ id: workOrders.id, bomId: workOrders.bomId, quantityOrdered: workOrders.quantityOrdered, quantityCompleted: workOrders.quantityCompleted })
    .from(workOrders)
    .where(inArray(workOrders.status, [...OPEN_WORK_ORDER_STATUSES]));

  const totals = new Map<string, { materialName: string; unit: string; totalRequired: number; workOrderIds: Set<string> }>();

  for (const wo of openOrders) {
    const remaining = Number(wo.quantityOrdered) - Number(wo.quantityCompleted);
    if (remaining <= 0) continue;
    const requirements = await computeMaterialRequirements(wo.bomId, remaining);
    for (const req of requirements) {
      const existing = totals.get(req.materialId);
      if (existing) {
        existing.totalRequired += req.requiredQuantity;
        existing.workOrderIds.add(wo.id);
      } else {
        totals.set(req.materialId, { materialName: req.materialName, unit: req.unit, totalRequired: req.requiredQuantity, workOrderIds: new Set([wo.id]) });
      }
    }
  }

  if (totals.size === 0) return [];

  const materialIds = [...totals.keys()];
  const [materialRows, availabilityRows] = await Promise.all([
    db.select({ id: rawMaterials.id, sku: rawMaterials.sku, reorderLevel: rawMaterials.reorderLevel }).from(rawMaterials).where(inArray(rawMaterials.id, materialIds)),
    db
      .select({ materialId: materialStock.materialId, total: sql<string>`coalesce(sum(${materialStock.quantity}), 0)` })
      .from(materialStock)
      .where(inArray(materialStock.materialId, materialIds))
      .groupBy(materialStock.materialId),
  ]);
  const skuByMaterial = new Map(materialRows.map((m) => [m.id, m.sku]));
  const reorderByMaterial = new Map(materialRows.map((m) => [m.id, Number(m.reorderLevel)]));
  const availabilityByMaterial = new Map(availabilityRows.map((r) => [r.materialId, Number(r.total)]));

  return [...totals.entries()]
    .map(([materialId, v]) => {
      const availableQuantity = availabilityByMaterial.get(materialId) ?? 0;
      return {
        materialId,
        materialName: v.materialName,
        sku: skuByMaterial.get(materialId) ?? "",
        unit: v.unit,
        totalRequired: v.totalRequired,
        availableQuantity,
        shortfall: Math.max(0, v.totalRequired - availableQuantity),
        reorderLevel: reorderByMaterial.get(materialId) ?? 0,
        openWorkOrderCount: v.workOrderIds.size,
      };
    })
    .sort((a, b) => b.shortfall - a.shortfall);
}

export interface ScrapReasonRow {
  reason: string;
  quantity: number;
}

export interface ScrapByProductRow {
  finishedGoodId: string;
  finishedGoodName: string;
  quantityGood: number;
  quantityScrap: number;
  scrapRatePct: number;
}

export interface MaterialWasteRow {
  materialId: string;
  materialName: string;
  unit: string;
  quantity: number;
  estimatedCost: number;
}

export interface ScrapReport {
  totalGood: number;
  totalScrap: number;
  scrapRatePct: number;
  byReason: ScrapReasonRow[];
  byProduct: ScrapByProductRow[];
  materialWaste: MaterialWasteRow[];
}

/** Two scrap sources this module tracks, reported side by side: finished-unit scrap from production_output_logs (a stage produced a bad unit) and raw-material waste from material_stock_movements (material spoiled/damaged before ever becoming output). */
export async function getScrapReport(): Promise<ScrapReport> {
  const outputRows = await db
    .select({
      finishedGoodId: workOrders.finishedGoodId,
      finishedGoodName: finishedGoods.name,
      scrapReason: productionOutputLogs.scrapReason,
      quantityGood: productionOutputLogs.quantityGood,
      quantityScrap: productionOutputLogs.quantityScrap,
    })
    .from(productionOutputLogs)
    .innerJoin(workOrders, eq(workOrders.id, productionOutputLogs.workOrderId))
    .innerJoin(finishedGoods, eq(finishedGoods.id, workOrders.finishedGoodId));

  let totalGood = 0;
  let totalScrap = 0;
  const byReasonMap = new Map<string, number>();
  const byProductMap = new Map<string, { finishedGoodName: string; quantityGood: number; quantityScrap: number }>();

  for (const r of outputRows) {
    const good = Number(r.quantityGood);
    const scrap = Number(r.quantityScrap);
    totalGood += good;
    totalScrap += scrap;
    if (scrap > 0) {
      const reason = r.scrapReason?.trim() || "Unspecified";
      byReasonMap.set(reason, (byReasonMap.get(reason) ?? 0) + scrap);
    }
    const existing = byProductMap.get(r.finishedGoodId);
    if (existing) {
      existing.quantityGood += good;
      existing.quantityScrap += scrap;
    } else {
      byProductMap.set(r.finishedGoodId, { finishedGoodName: r.finishedGoodName, quantityGood: good, quantityScrap: scrap });
    }
  }

  const materialWasteRows = await db
    .select({
      materialId: materialStockMovements.materialId,
      materialName: rawMaterials.name,
      unit: rawMaterials.unit,
      quantity: sql<string>`sum(${materialStockMovements.quantity})`,
      cost: sql<string>`sum(${materialStockMovements.quantity} * coalesce(${materialStockMovements.unitCostSnapshot}, 0))`,
    })
    .from(materialStockMovements)
    .innerJoin(rawMaterials, eq(rawMaterials.id, materialStockMovements.materialId))
    .where(eq(materialStockMovements.movementType, "waste"))
    .groupBy(materialStockMovements.materialId, rawMaterials.name, rawMaterials.unit);

  return {
    totalGood,
    totalScrap,
    scrapRatePct: totalGood + totalScrap > 0 ? (totalScrap / (totalGood + totalScrap)) * 100 : 0,
    byReason: [...byReasonMap.entries()].map(([reason, quantity]) => ({ reason, quantity })).sort((a, b) => b.quantity - a.quantity),
    byProduct: [...byProductMap.entries()]
      .map(([finishedGoodId, v]) => ({
        finishedGoodId,
        finishedGoodName: v.finishedGoodName,
        quantityGood: v.quantityGood,
        quantityScrap: v.quantityScrap,
        scrapRatePct: v.quantityGood + v.quantityScrap > 0 ? (v.quantityScrap / (v.quantityGood + v.quantityScrap)) * 100 : 0,
      }))
      .sort((a, b) => b.quantityScrap - a.quantityScrap),
    materialWaste: materialWasteRows.map((m) => ({ materialId: m.materialId, materialName: m.materialName, unit: m.unit, quantity: Number(m.quantity), estimatedCost: Number(m.cost) })),
  };
}

export interface CostingReportRow {
  workOrderId: string;
  orderNumber: string;
  finishedGoodName: string;
  status: string;
  quantityCompleted: number;
  materialCost: number;
  laborCost: number;
  totalCost: number;
  unitCost: number | null;
}

/** Same two ledgers as workOrders.service.ts's getWorkOrderCost, rolled up across the shop floor's most recent orders instead of just one. */
export async function getCostingReport(): Promise<CostingReportRow[]> {
  const woRows = await db
    .select({
      id: workOrders.id,
      orderNumber: workOrders.orderNumber,
      finishedGoodName: finishedGoods.name,
      status: workOrders.status,
      quantityCompleted: workOrders.quantityCompleted,
    })
    .from(workOrders)
    .innerJoin(finishedGoods, eq(finishedGoods.id, workOrders.finishedGoodId))
    .where(inArray(workOrders.status, ["in_progress", "paused", "completed"]))
    .orderBy(desc(workOrders.createdAt))
    .limit(50);

  if (woRows.length === 0) return [];
  const workOrderIds = woRows.map((w) => w.id);

  const [materialCostRows, laborCostRows] = await Promise.all([
    db
      .select({
        workOrderId: materialStockMovements.referenceId,
        cost: sql<string>`sum(${materialStockMovements.quantity} * coalesce(${materialStockMovements.unitCostSnapshot}, 0))`,
      })
      .from(materialStockMovements)
      .where(
        and(
          eq(materialStockMovements.referenceType, "work_order"),
          eq(materialStockMovements.movementType, "issue"),
          inArray(materialStockMovements.referenceId, workOrderIds),
        ),
      )
      .groupBy(materialStockMovements.referenceId),
    db
      .select({ workOrderId: laborLogs.workOrderId, cost: sql<string>`sum(${laborLogs.hoursWorked} * coalesce(${laborLogs.hourlyRate}, 0))` })
      .from(laborLogs)
      .where(inArray(laborLogs.workOrderId, workOrderIds))
      .groupBy(laborLogs.workOrderId),
  ]);
  const materialCostByWo = new Map(materialCostRows.map((r) => [r.workOrderId as string, Number(r.cost)]));
  const laborCostByWo = new Map(laborCostRows.map((r) => [r.workOrderId, Number(r.cost)]));

  return woRows
    .map((w) => {
      const materialCost = materialCostByWo.get(w.id) ?? 0;
      const laborCost = laborCostByWo.get(w.id) ?? 0;
      const totalCost = materialCost + laborCost;
      const quantityCompleted = Number(w.quantityCompleted);
      return {
        workOrderId: w.id,
        orderNumber: w.orderNumber,
        finishedGoodName: w.finishedGoodName,
        status: w.status,
        quantityCompleted,
        materialCost,
        laborCost,
        totalCost,
        unitCost: quantityCompleted > 0 ? totalCost / quantityCompleted : null,
      };
    })
    .sort((a, b) => b.totalCost - a.totalCost);
}
