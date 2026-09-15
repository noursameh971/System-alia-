import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import {
  finishedGoodsStock,
  materialCosts,
  materialStock,
  productionOutputLogs,
  rawMaterials,
  workOrders,
} from "../../db/schema/index.js";

export interface FactoryDashboardSummary {
  activeWorkOrders: number;
  materialsBelowReorder: number;
  rawMaterialInventoryValue: number;
  finishedGoodsOnHand: number;
  monthGoodOutput: number;
  monthScrapOutput: number;
}

export async function getFactoryDashboardSummary(): Promise<FactoryDashboardSummary> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [activeWorkOrderRows, materialRows, finishedGoodsRows, outputRows] = await Promise.all([
    db
      .select({ activeWorkOrders: sql<number>`count(*)::int` })
      .from(workOrders)
      .where(inArray(workOrders.status, ["scheduled", "in_progress", "paused"])),
    db
      .select({
        materialId: rawMaterials.id,
        reorderLevel: rawMaterials.reorderLevel,
        totalStock: sql<string>`coalesce((select sum(${materialStock.quantity}) from ${materialStock} where ${materialStock.materialId} = ${rawMaterials.id}), 0)`,
        costPerUnit: materialCosts.costPerUnit,
      })
      .from(rawMaterials)
      .leftJoin(materialCosts, and(eq(materialCosts.materialId, rawMaterials.id), isNull(materialCosts.effectiveTo)))
      .where(eq(rawMaterials.isActive, true)),
    db.select({ finishedGoodsOnHand: sql<string>`coalesce(sum(${finishedGoodsStock.quantity}), 0)` }).from(finishedGoodsStock),
    db
      .select({
        monthGood: sql<string>`coalesce(sum(${productionOutputLogs.quantityGood}), 0)`,
        monthScrap: sql<string>`coalesce(sum(${productionOutputLogs.quantityScrap}), 0)`,
      })
      .from(productionOutputLogs)
      .where(gte(productionOutputLogs.recordedAt, startOfMonth)),
  ]);

  const materialsBelowReorder = materialRows.filter((m) => Number(m.totalStock) < Number(m.reorderLevel)).length;
  const rawMaterialInventoryValue = materialRows.reduce((sum, m) => sum + Number(m.totalStock) * Number(m.costPerUnit ?? 0), 0);

  return {
    activeWorkOrders: activeWorkOrderRows[0]?.activeWorkOrders ?? 0,
    materialsBelowReorder,
    rawMaterialInventoryValue,
    finishedGoodsOnHand: Number(finishedGoodsRows[0]?.finishedGoodsOnHand ?? 0),
    monthGoodOutput: Number(outputRows[0]?.monthGood ?? 0),
    monthScrapOutput: Number(outputRows[0]?.monthScrap ?? 0),
  };
}
