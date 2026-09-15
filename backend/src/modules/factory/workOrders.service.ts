import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import {
  bomStages,
  boms,
  factoryLocations,
  finishedGoods,
  finishedGoodsMovements,
  finishedGoodsStock,
  laborLogs,
  machines,
  materialCosts,
  materialStockMovements,
  productionOutputLogs,
  productionLines,
  productionStageTemplates,
  qualityChecks,
  workOrderStages,
  workOrders,
} from "../../db/schema/index.js";
import { ApiError } from "../../utils/apiError.js";
import { computeMaterialRequirements } from "./boms.service.js";
import type { Tx } from "./factory.types.js";
import { adjustMaterialBalance } from "./materials.service.js";
import type {
  CreateWorkOrderInput,
  IssueBomMaterialsInput,
  RecordLaborInput,
  RecordOutputInput,
  RecordQualityCheckInput,
  UpdateWorkOrderInput,
  UpdateWorkOrderStageInput,
} from "./workOrders.schema.js";

export interface WorkOrderListItem {
  id: string;
  orderNumber: string;
  finishedGoodId: string;
  finishedGoodName: string;
  bomVersion: number;
  quantityOrdered: number;
  quantityCompleted: number;
  quantityScrapped: number;
  status: string;
  priority: string;
  lineId: string | null;
  lineName: string | null;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  createdAt: Date;
}

export async function listWorkOrders(status?: string): Promise<WorkOrderListItem[]> {
  const rows = await db
    .select({
      id: workOrders.id,
      orderNumber: workOrders.orderNumber,
      finishedGoodId: workOrders.finishedGoodId,
      finishedGoodName: finishedGoods.name,
      bomVersion: boms.version,
      quantityOrdered: workOrders.quantityOrdered,
      quantityCompleted: workOrders.quantityCompleted,
      quantityScrapped: workOrders.quantityScrapped,
      status: workOrders.status,
      priority: workOrders.priority,
      lineId: workOrders.lineId,
      lineName: productionLines.name,
      plannedStartDate: workOrders.plannedStartDate,
      plannedEndDate: workOrders.plannedEndDate,
      createdAt: workOrders.createdAt,
    })
    .from(workOrders)
    .innerJoin(finishedGoods, eq(finishedGoods.id, workOrders.finishedGoodId))
    .innerJoin(boms, eq(boms.id, workOrders.bomId))
    .leftJoin(productionLines, eq(productionLines.id, workOrders.lineId))
    .where(status ? eq(workOrders.status, status as (typeof workOrders.status.enumValues)[number]) : undefined)
    .orderBy(desc(workOrders.createdAt));

  return rows.map((r) => ({
    ...r,
    quantityOrdered: Number(r.quantityOrdered),
    quantityCompleted: Number(r.quantityCompleted),
    quantityScrapped: Number(r.quantityScrapped),
  }));
}

export interface WorkOrderDetail extends WorkOrderListItem {
  bomId: string;
  notes: string | null;
  actualStartAt: Date | null;
  actualEndAt: Date | null;
  stages: {
    id: string;
    stageTemplateId: string;
    stageName: string;
    sequenceOrder: number;
    status: string;
    lineId: string | null;
    machineId: string | null;
  }[];
  materialRequirements: Awaited<ReturnType<typeof computeMaterialRequirements>>;
  laborLogs: { id: string; workerName: string; hoursWorked: number; quantityProduced: number; logDate: string; createdAt: Date }[];
  outputLogs: { id: string; quantityGood: number; quantityScrap: number; scrapReason: string | null; recordedAt: Date }[];
  qualityChecks: { id: string; checkedQuantity: number; passedQuantity: number; failedQuantity: number; result: string; checkedAt: Date }[];
  costing: WorkOrderCost;
}

export interface WorkOrderCost {
  materialCost: number;
  laborCost: number;
  totalCost: number;
  unitCost: number | null;
}

/** Rolled up from the same two ledgers everything else in this file already writes to — material_stock_movements' unit_cost_snapshot (frozen at issue time) and labor_logs' hourly_rate — never a separately maintained total. */
export async function getWorkOrderCost(workOrderId: string): Promise<WorkOrderCost> {
  const [wo] = await db.select({ quantityCompleted: workOrders.quantityCompleted }).from(workOrders).where(eq(workOrders.id, workOrderId)).limit(1);
  if (!wo) throw ApiError.notFound(`Work order ${workOrderId} does not exist`);

  const [[materialRow], [laborRow]] = await Promise.all([
    db
      .select({ cost: sql<string>`coalesce(sum(${materialStockMovements.quantity} * coalesce(${materialStockMovements.unitCostSnapshot}, 0)), 0)` })
      .from(materialStockMovements)
      .where(
        and(
          eq(materialStockMovements.referenceType, "work_order"),
          eq(materialStockMovements.referenceId, workOrderId),
          eq(materialStockMovements.movementType, "issue"),
        ),
      ),
    db
      .select({ cost: sql<string>`coalesce(sum(${laborLogs.hoursWorked} * coalesce(${laborLogs.hourlyRate}, 0)), 0)` })
      .from(laborLogs)
      .where(eq(laborLogs.workOrderId, workOrderId)),
  ]);

  const materialCost = Number(materialRow?.cost ?? 0);
  const laborCost = Number(laborRow?.cost ?? 0);
  const totalCost = materialCost + laborCost;
  const quantityCompleted = Number(wo.quantityCompleted);

  return { materialCost, laborCost, totalCost, unitCost: quantityCompleted > 0 ? totalCost / quantityCompleted : null };
}

export async function getWorkOrderDetail(workOrderId: string): Promise<WorkOrderDetail> {
  const header = await listWorkOrders().then((rows) => rows.find((r) => r.id === workOrderId));
  if (!header) throw ApiError.notFound(`Work order ${workOrderId} does not exist`);

  const [row] = await db
    .select({ bomId: workOrders.bomId, notes: workOrders.notes, actualStartAt: workOrders.actualStartAt, actualEndAt: workOrders.actualEndAt })
    .from(workOrders)
    .where(eq(workOrders.id, workOrderId))
    .limit(1);

  const stageRows = await db
    .select({
      id: workOrderStages.id,
      stageTemplateId: workOrderStages.stageTemplateId,
      stageName: productionStageTemplates.name,
      sequenceOrder: workOrderStages.sequenceOrder,
      status: workOrderStages.status,
      lineId: workOrderStages.lineId,
      machineId: workOrderStages.machineId,
    })
    .from(workOrderStages)
    .innerJoin(productionStageTemplates, eq(productionStageTemplates.id, workOrderStages.stageTemplateId))
    .where(eq(workOrderStages.workOrderId, workOrderId))
    .orderBy(workOrderStages.sequenceOrder);

  const [materialRequirements, laborRows, outputRows, qcRows, costing] = await Promise.all([
    computeMaterialRequirements(row!.bomId, header.quantityOrdered),
    db
      .select({
        id: laborLogs.id,
        workerName: laborLogs.workerName,
        hoursWorked: laborLogs.hoursWorked,
        quantityProduced: laborLogs.quantityProduced,
        logDate: laborLogs.logDate,
        createdAt: laborLogs.createdAt,
      })
      .from(laborLogs)
      .where(eq(laborLogs.workOrderId, workOrderId))
      .orderBy(desc(laborLogs.createdAt)),
    db
      .select({
        id: productionOutputLogs.id,
        quantityGood: productionOutputLogs.quantityGood,
        quantityScrap: productionOutputLogs.quantityScrap,
        scrapReason: productionOutputLogs.scrapReason,
        recordedAt: productionOutputLogs.recordedAt,
      })
      .from(productionOutputLogs)
      .where(eq(productionOutputLogs.workOrderId, workOrderId))
      .orderBy(desc(productionOutputLogs.recordedAt)),
    db
      .select({
        id: qualityChecks.id,
        checkedQuantity: qualityChecks.checkedQuantity,
        passedQuantity: qualityChecks.passedQuantity,
        failedQuantity: qualityChecks.failedQuantity,
        result: qualityChecks.result,
        checkedAt: qualityChecks.checkedAt,
      })
      .from(qualityChecks)
      .where(eq(qualityChecks.workOrderId, workOrderId))
      .orderBy(desc(qualityChecks.checkedAt)),
    getWorkOrderCost(workOrderId),
  ]);

  return {
    ...header,
    bomId: row!.bomId,
    notes: row!.notes,
    actualStartAt: row!.actualStartAt,
    actualEndAt: row!.actualEndAt,
    stages: stageRows,
    materialRequirements,
    laborLogs: laborRows.map((l) => ({ ...l, hoursWorked: Number(l.hoursWorked), quantityProduced: Number(l.quantityProduced) })),
    outputLogs: outputRows.map((o) => ({ ...o, quantityGood: Number(o.quantityGood), quantityScrap: Number(o.quantityScrap) })),
    qualityChecks: qcRows.map((q) => ({
      ...q,
      checkedQuantity: Number(q.checkedQuantity),
      passedQuantity: Number(q.passedQuantity),
      failedQuantity: Number(q.failedQuantity),
    })),
    costing,
  };
}

export async function createWorkOrder(input: CreateWorkOrderInput, actorUserId: string) {
  return db.transaction(async (tx) => {
    const [bom] = await tx.select().from(boms).where(eq(boms.id, input.bomId)).limit(1);
    if (!bom) throw ApiError.notFound(`BOM ${input.bomId} does not exist`);
    if (bom.finishedGoodId !== input.finishedGoodId) {
      throw ApiError.badRequest("This BOM does not belong to the selected finished good");
    }

    const seqResult = await tx.execute<{ seq: string }>(sql`select nextval('factory_work_order_seq') as seq`);
    const orderNumber = `WO-${String(Number(seqResult.rows[0]?.seq)).padStart(6, "0")}`;

    const [workOrder] = await tx
      .insert(workOrders)
      .values({
        orderNumber,
        finishedGoodId: input.finishedGoodId,
        bomId: input.bomId,
        quantityOrdered: input.quantityOrdered.toFixed(3),
        priority: input.priority,
        lineId: input.lineId,
        plannedStartDate: input.plannedStartDate,
        plannedEndDate: input.plannedEndDate,
        notes: input.notes,
        createdBy: actorUserId,
      })
      .returning();

    // Instantiate this order's own copy of the BOM's routing, if it has one
    // — a separate table (not a live reference to bom_stages) so per-order
    // progress can be tracked without ever mutating the BOM template.
    const templateStages = await tx.select().from(bomStages).where(eq(bomStages.bomId, input.bomId)).orderBy(bomStages.sequenceOrder);
    if (templateStages.length > 0) {
      await tx.insert(workOrderStages).values(
        templateStages.map((s) => ({
          workOrderId: workOrder!.id,
          stageTemplateId: s.stageTemplateId,
          sequenceOrder: s.sequenceOrder,
          lineId: s.defaultLineId,
        })),
      );
    }

    return { id: workOrder!.id, orderNumber: workOrder!.orderNumber };
  });
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ["scheduled", "cancelled"],
  scheduled: ["in_progress", "cancelled"],
  in_progress: ["paused", "completed", "cancelled"],
  paused: ["in_progress", "cancelled"],
  completed: [],
  cancelled: [],
};

export async function updateWorkOrderStatus(workOrderId: string, status: string, _actorUserId: string, reason?: string) {
  return db.transaction(async (tx) => {
    const [current] = await tx.select({ status: workOrders.status }).from(workOrders).where(eq(workOrders.id, workOrderId)).limit(1);
    if (!current) throw ApiError.notFound(`Work order ${workOrderId} does not exist`);

    if (current.status !== status && !VALID_TRANSITIONS[current.status]?.includes(status)) {
      throw ApiError.badRequest(`Can't move a work order from "${current.status}" to "${status}"`);
    }

    // Appended (not overwritten) onto the free-text notes field — an
    // auditable trail of why an order was paused/cancelled, without a
    // dedicated column for what's occasional, human-readable context.
    const noteAddition = reason ? `[${status}] ${reason}` : null;

    const [updated] = await tx
      .update(workOrders)
      .set({
        status: status as (typeof workOrders.status.enumValues)[number],
        ...(status === "in_progress" ? { actualStartAt: sql`coalesce(actual_start_at, now())` } : {}),
        ...(status === "completed" ? { actualEndAt: sql`now()` } : {}),
        ...(noteAddition ? { notes: sql`trim(both e'\n' from coalesce(${workOrders.notes}, '') || e'\n' || ${noteAddition})` } : {}),
        updatedAt: sql`now()`,
      })
      .where(eq(workOrders.id, workOrderId))
      .returning();
    return updated!;
  });
}

/** Only while the order hasn't started production — once it's in_progress/paused/completed/cancelled, quantity/schedule edits could silently invalidate materials already issued or output already recorded against the original plan. */
export async function updateWorkOrder(workOrderId: string, input: UpdateWorkOrderInput) {
  const [current] = await db.select({ status: workOrders.status }).from(workOrders).where(eq(workOrders.id, workOrderId)).limit(1);
  if (!current) throw ApiError.notFound(`Work order ${workOrderId} does not exist`);
  if (current.status !== "draft" && current.status !== "scheduled") {
    throw ApiError.badRequest(`Can't edit a work order once it's "${current.status}" — cancel and recreate it instead`);
  }

  const [updated] = await db
    .update(workOrders)
    .set({
      ...(input.quantityOrdered !== undefined ? { quantityOrdered: input.quantityOrdered.toFixed(3) } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.lineId !== undefined ? { lineId: input.lineId } : {}),
      ...(input.plannedStartDate !== undefined ? { plannedStartDate: input.plannedStartDate } : {}),
      ...(input.plannedEndDate !== undefined ? { plannedEndDate: input.plannedEndDate } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      updatedAt: sql`now()`,
    })
    .where(eq(workOrders.id, workOrderId))
    .returning();
  return updated!;
}

const VALID_STAGE_TRANSITIONS: Record<string, string[]> = {
  pending: ["in_progress", "skipped"],
  in_progress: ["completed", "skipped"],
  completed: [],
  skipped: [],
};

/** Per-stage progress tracking — work_order_stages already carries status/machine/timestamps (instantiated from the BOM's routing in createWorkOrder), this is just the first endpoint that ever writes to it after creation. */
export async function updateWorkOrderStage(workOrderId: string, stageId: string, input: UpdateWorkOrderStageInput) {
  return db.transaction(async (tx) => {
    const [stage] = await tx.select().from(workOrderStages).where(eq(workOrderStages.id, stageId)).limit(1);
    if (!stage || stage.workOrderId !== workOrderId) throw ApiError.notFound(`Stage ${stageId} does not exist on this work order`);

    if (input.status && input.status !== stage.status && !VALID_STAGE_TRANSITIONS[stage.status]?.includes(input.status)) {
      throw ApiError.badRequest(`Can't move a stage from "${stage.status}" to "${input.status}"`);
    }

    if (input.machineId) {
      const [machine] = await tx.select({ id: machines.id }).from(machines).where(eq(machines.id, input.machineId)).limit(1);
      if (!machine) throw ApiError.notFound(`Machine ${input.machineId} does not exist`);
    }

    const [updated] = await tx
      .update(workOrderStages)
      .set({
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.status === "in_progress" ? { actualStartAt: sql`coalesce(actual_start_at, now())` } : {}),
        ...(input.status === "completed" || input.status === "skipped" ? { actualEndAt: sql`now()` } : {}),
        ...(input.machineId !== undefined ? { machineId: input.machineId } : {}),
        ...(input.lineId !== undefined ? { lineId: input.lineId } : {}),
      })
      .where(eq(workOrderStages.id, stageId))
      .returning();
    return updated!;
  });
}

/** Issues exactly the BOM-computed requirement for this order's quantity — the MRP number becomes a real stock movement in one step, rather than the operator re-typing per-material quantities by hand. */
export async function issueBomMaterials(workOrderId: string, input: IssueBomMaterialsInput, actorUserId: string) {
  return db.transaction(async (tx) => {
    const [workOrder] = await tx.select().from(workOrders).where(eq(workOrders.id, workOrderId)).limit(1);
    if (!workOrder) throw ApiError.notFound(`Work order ${workOrderId} does not exist`);

    const [location] = await tx.select({ id: factoryLocations.id }).from(factoryLocations).where(eq(factoryLocations.id, input.fromLocationId)).limit(1);
    if (!location) throw ApiError.notFound(`Location ${input.fromLocationId} does not exist`);

    const requirements = await computeMaterialRequirements(workOrder.bomId, Number(workOrder.quantityOrdered));

    for (const req of requirements) {
      if (req.requiredQuantity <= 0) continue;

      const [activeCost] = await tx
        .select({ costPerUnit: materialCosts.costPerUnit })
        .from(materialCosts)
        .where(and(eq(materialCosts.materialId, req.materialId), isNull(materialCosts.effectiveTo)))
        .limit(1);

      await adjustMaterialBalance(tx, req.materialId, input.fromLocationId, -req.requiredQuantity);
      await tx.execute(sql`
        insert into material_stock_movements
          (material_id, movement_type, quantity, from_location_id, unit_cost_snapshot, reference_type, reference_id, performed_by, notes)
        values
          (${req.materialId}, 'issue', ${req.requiredQuantity.toFixed(3)}, ${input.fromLocationId}, ${activeCost?.costPerUnit ?? null},
           'work_order', ${workOrderId}, ${actorUserId}, ${input.notes ?? `Issued for ${workOrder.orderNumber}`})
      `);
    }

    return { issuedMaterialCount: requirements.filter((r) => r.requiredQuantity > 0).length };
  });
}

async function adjustFinishedGoodsBalance(tx: Tx, finishedGoodId: string, locationId: string, delta: number): Promise<void> {
  const [existing] = await tx
    .select()
    .from(finishedGoodsStock)
    .where(and(eq(finishedGoodsStock.finishedGoodId, finishedGoodId), eq(finishedGoodsStock.locationId, locationId)))
    .limit(1);
  const newQuantity = (existing ? Number(existing.quantity) : 0) + delta;
  if (existing) {
    await tx.update(finishedGoodsStock).set({ quantity: newQuantity.toFixed(3), updatedAt: sql`now()` }).where(eq(finishedGoodsStock.id, existing.id));
  } else {
    await tx.insert(finishedGoodsStock).values({ finishedGoodId, locationId, quantity: newQuantity.toFixed(3) });
  }
}

/** Records good/scrap output for this order. Good units flow straight into Finished Goods Inventory (a production_receipt movement) — output tracking and finished-goods stock are the same event, not two disconnected features. */
export async function recordOutput(workOrderId: string, input: RecordOutputInput, actorUserId: string) {
  return db.transaction(async (tx) => {
    const [workOrder] = await tx.select().from(workOrders).where(eq(workOrders.id, workOrderId)).limit(1);
    if (!workOrder) throw ApiError.notFound(`Work order ${workOrderId} does not exist`);

    await tx.insert(productionOutputLogs).values({
      workOrderId,
      stageId: input.stageId,
      quantityGood: input.quantityGood.toFixed(3),
      quantityScrap: input.quantityScrap.toFixed(3),
      scrapReason: input.scrapReason,
      recordedBy: actorUserId,
      notes: input.notes,
    });

    await tx
      .update(workOrders)
      .set({
        quantityCompleted: sql`${workOrders.quantityCompleted} + ${input.quantityGood.toFixed(3)}`,
        quantityScrapped: sql`${workOrders.quantityScrapped} + ${input.quantityScrap.toFixed(3)}`,
        updatedAt: sql`now()`,
      })
      .where(eq(workOrders.id, workOrderId));

    if (input.quantityGood > 0) {
      let locationId = input.locationId;
      if (!locationId) {
        const [defaultLocation] = await tx.select({ id: factoryLocations.id }).from(factoryLocations).where(eq(factoryLocations.kind, "finished_goods")).limit(1);
        if (!defaultLocation) throw ApiError.badRequest("No finished-goods location exists — create one first");
        locationId = defaultLocation.id;
      }

      await adjustFinishedGoodsBalance(tx, workOrder.finishedGoodId, locationId, input.quantityGood);
      await tx.insert(finishedGoodsMovements).values({
        finishedGoodId: workOrder.finishedGoodId,
        movementType: "production_receipt",
        quantity: input.quantityGood.toFixed(3),
        toLocationId: locationId,
        referenceType: "work_order",
        referenceId: workOrderId,
        performedBy: actorUserId,
        notes: `Output recorded for ${workOrder.orderNumber}`,
      });
    }

    return { recorded: true };
  });
}

export async function recordLabor(workOrderId: string, input: RecordLaborInput, actorUserId: string) {
  const [workOrder] = await db.select({ id: workOrders.id }).from(workOrders).where(eq(workOrders.id, workOrderId)).limit(1);
  if (!workOrder) throw ApiError.notFound(`Work order ${workOrderId} does not exist`);

  const [created] = await db
    .insert(laborLogs)
    .values({
      workOrderId,
      stageId: input.stageId,
      workerName: input.workerName,
      hoursWorked: input.hoursWorked.toFixed(2),
      hourlyRate: input.hourlyRate != null ? input.hourlyRate.toFixed(2) : null,
      quantityProduced: input.quantityProduced.toFixed(3),
      logDate: input.logDate,
      notes: input.notes,
      loggedBy: actorUserId,
    })
    .returning();
  return created!;
}

export async function recordQualityCheck(workOrderId: string, input: RecordQualityCheckInput, actorUserId: string) {
  const [workOrder] = await db.select({ id: workOrders.id }).from(workOrders).where(eq(workOrders.id, workOrderId)).limit(1);
  if (!workOrder) throw ApiError.notFound(`Work order ${workOrderId} does not exist`);

  const [created] = await db
    .insert(qualityChecks)
    .values({
      workOrderId,
      stageId: input.stageId,
      checkedQuantity: input.checkedQuantity.toFixed(3),
      passedQuantity: input.passedQuantity.toFixed(3),
      failedQuantity: input.failedQuantity.toFixed(3),
      result: input.result,
      inspectorNotes: input.inspectorNotes,
      checkedBy: actorUserId,
    })
    .returning();
  return created!;
}

