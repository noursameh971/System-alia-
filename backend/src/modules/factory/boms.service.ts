import { desc, eq, max, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import {
  bomLines,
  bomStages,
  boms,
  finishedGoods,
  materialStock,
  productionStageTemplates,
  rawMaterials,
} from "../../db/schema/index.js";
import { ApiError } from "../../utils/apiError.js";
import type { CreateBomInput, CreateFinishedGoodInput } from "./boms.schema.js";

export function listFinishedGoods() {
  return db.select().from(finishedGoods).orderBy(finishedGoods.name);
}

export async function createFinishedGood(input: CreateFinishedGoodInput) {
  const seqResult = await db.execute<{ seq: string }>(sql`select nextval('factory_finished_good_sku_seq') as seq`);
  const sequence = Number(seqResult.rows[0]?.seq);
  const sku = `FG-${String(sequence).padStart(5, "0")}`;

  const [created] = await db
    .insert(finishedGoods)
    .values({ name: input.name, unit: input.unit, sku, linkedVariantId: input.linkedVariantId ?? null })
    .returning();
  return created!;
}

export interface BomListItem {
  id: string;
  finishedGoodId: string;
  finishedGoodName: string;
  version: number;
  label: string | null;
  status: string;
  outputQuantity: number;
  createdAt: Date;
}

export async function listBoms(finishedGoodId?: string): Promise<BomListItem[]> {
  const rows = await db
    .select({
      id: boms.id,
      finishedGoodId: boms.finishedGoodId,
      finishedGoodName: finishedGoods.name,
      version: boms.version,
      label: boms.label,
      status: boms.status,
      outputQuantity: boms.outputQuantity,
      createdAt: boms.createdAt,
    })
    .from(boms)
    .innerJoin(finishedGoods, eq(finishedGoods.id, boms.finishedGoodId))
    .where(finishedGoodId ? eq(boms.finishedGoodId, finishedGoodId) : undefined)
    .orderBy(desc(boms.createdAt));

  return rows.map((r) => ({ ...r, outputQuantity: Number(r.outputQuantity) }));
}

export interface BomDetail extends BomListItem {
  notes: string | null;
  lines: {
    id: string;
    materialId: string;
    materialName: string;
    materialUnit: string;
    quantityPerBatch: number;
    wasteAllowancePct: number;
    sequenceOrder: number;
    notes: string | null;
  }[];
  stages: {
    id: string;
    stageTemplateId: string;
    stageName: string;
    sequenceOrder: number;
    standardTimeMinutes: number | null;
    defaultLineId: string | null;
  }[];
}

export async function getBom(bomId: string): Promise<BomDetail> {
  const [bom] = await db
    .select({
      id: boms.id,
      finishedGoodId: boms.finishedGoodId,
      finishedGoodName: finishedGoods.name,
      version: boms.version,
      label: boms.label,
      status: boms.status,
      outputQuantity: boms.outputQuantity,
      notes: boms.notes,
      createdAt: boms.createdAt,
    })
    .from(boms)
    .innerJoin(finishedGoods, eq(finishedGoods.id, boms.finishedGoodId))
    .where(eq(boms.id, bomId))
    .limit(1);
  if (!bom) throw ApiError.notFound(`BOM ${bomId} does not exist`);

  const lineRows = await db
    .select({
      id: bomLines.id,
      materialId: bomLines.materialId,
      materialName: rawMaterials.name,
      materialUnit: rawMaterials.unit,
      quantityPerBatch: bomLines.quantityPerBatch,
      wasteAllowancePct: bomLines.wasteAllowancePct,
      sequenceOrder: bomLines.sequenceOrder,
      notes: bomLines.notes,
    })
    .from(bomLines)
    .innerJoin(rawMaterials, eq(rawMaterials.id, bomLines.materialId))
    .where(eq(bomLines.bomId, bomId))
    .orderBy(bomLines.sequenceOrder);

  const stageRows = await db
    .select({
      id: bomStages.id,
      stageTemplateId: bomStages.stageTemplateId,
      stageName: productionStageTemplates.name,
      sequenceOrder: bomStages.sequenceOrder,
      standardTimeMinutes: bomStages.standardTimeMinutes,
      defaultLineId: bomStages.defaultLineId,
    })
    .from(bomStages)
    .innerJoin(productionStageTemplates, eq(productionStageTemplates.id, bomStages.stageTemplateId))
    .where(eq(bomStages.bomId, bomId))
    .orderBy(bomStages.sequenceOrder);

  return {
    ...bom,
    outputQuantity: Number(bom.outputQuantity),
    lines: lineRows.map((l) => ({
      ...l,
      quantityPerBatch: Number(l.quantityPerBatch),
      wasteAllowancePct: Number(l.wasteAllowancePct),
    })),
    stages: stageRows.map((s) => ({ ...s, standardTimeMinutes: s.standardTimeMinutes != null ? Number(s.standardTimeMinutes) : null })),
  };
}

/** Creates the next version for this finished good — BOMs are versioned rather than edited in place so an in-flight work order's snapshot never silently changes underneath it. */
export async function createBom(input: CreateBomInput, actorUserId: string) {
  return db.transaction(async (tx) => {
    const [finishedGood] = await tx.select({ id: finishedGoods.id }).from(finishedGoods).where(eq(finishedGoods.id, input.finishedGoodId)).limit(1);
    if (!finishedGood) throw ApiError.notFound(`Finished good ${input.finishedGoodId} does not exist`);

    for (const line of input.lines) {
      const [material] = await tx.select({ id: rawMaterials.id }).from(rawMaterials).where(eq(rawMaterials.id, line.materialId)).limit(1);
      if (!material) throw ApiError.notFound(`Material ${line.materialId} does not exist`);
    }

    const [maxVersionRow] = await tx
      .select({ maxVersion: max(boms.version) })
      .from(boms)
      .where(eq(boms.finishedGoodId, input.finishedGoodId));
    const version = (maxVersionRow?.maxVersion ?? 0) + 1;

    const [bom] = await tx
      .insert(boms)
      .values({
        finishedGoodId: input.finishedGoodId,
        version,
        label: input.label,
        outputQuantity: input.outputQuantity.toFixed(3),
        notes: input.notes,
        createdBy: actorUserId,
      })
      .returning();

    if (input.lines.length > 0) {
      await tx.insert(bomLines).values(
        input.lines.map((l) => ({
          bomId: bom!.id,
          materialId: l.materialId,
          quantityPerBatch: l.quantityPerBatch.toFixed(4),
          wasteAllowancePct: l.wasteAllowancePct.toFixed(2),
          sequenceOrder: l.sequenceOrder,
          notes: l.notes,
        })),
      );
    }

    if (input.stages.length > 0) {
      for (const stage of input.stages) {
        const [template] = await tx
          .select({ id: productionStageTemplates.id })
          .from(productionStageTemplates)
          .where(eq(productionStageTemplates.id, stage.stageTemplateId))
          .limit(1);
        if (!template) throw ApiError.notFound(`Stage template ${stage.stageTemplateId} does not exist`);
      }
      await tx.insert(bomStages).values(
        input.stages.map((s) => ({
          bomId: bom!.id,
          stageTemplateId: s.stageTemplateId,
          sequenceOrder: s.sequenceOrder,
          standardTimeMinutes: s.standardTimeMinutes != null ? s.standardTimeMinutes.toFixed(2) : null,
          defaultLineId: s.defaultLineId,
        })),
      );
    }

    return { id: bom!.id, version: bom!.version };
  });
}

export async function updateBomStatus(bomId: string, status: string) {
  const [updated] = await db.update(boms).set({ status, updatedAt: sql`now()` }).where(eq(boms.id, bomId)).returning();
  if (!updated) throw ApiError.notFound(`BOM ${bomId} does not exist`);
  return updated;
}

export interface MaterialRequirement {
  materialId: string;
  materialName: string;
  unit: string;
  requiredQuantity: number;
  availableQuantity: number;
  shortfall: number;
}

/**
 * MRP, computed on demand — never stored. For each BOM line, the quantity
 * needed for `quantityOrdered` finished units is
 * (quantityPerBatch / bom.outputQuantity) * quantityOrdered, inflated by the
 * line's waste allowance, then compared against current total material
 * stock across every location.
 */
export async function computeMaterialRequirements(bomId: string, quantityOrdered: number): Promise<MaterialRequirement[]> {
  const bom = await getBom(bomId);

  const availabilityRows = await db
    .select({ materialId: materialStock.materialId, total: sql<string>`coalesce(sum(${materialStock.quantity}), 0)` })
    .from(materialStock)
    .groupBy(materialStock.materialId);
  const availabilityByMaterial = new Map(availabilityRows.map((r) => [r.materialId, Number(r.total)]));

  return bom.lines.map((line) => {
    const perUnit = line.quantityPerBatch / bom.outputQuantity;
    const requiredQuantity = perUnit * quantityOrdered * (1 + line.wasteAllowancePct / 100);
    const availableQuantity = availabilityByMaterial.get(line.materialId) ?? 0;
    return {
      materialId: line.materialId,
      materialName: line.materialName,
      unit: line.materialUnit,
      requiredQuantity,
      availableQuantity,
      shortfall: Math.max(0, requiredQuantity - availableQuantity),
    };
  });
}
