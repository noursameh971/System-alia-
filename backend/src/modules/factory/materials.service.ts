import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import {
  factoryLocations,
  factoryMaterialCategories,
  materialCosts,
  materialStock,
  materialStockMovements,
  rawMaterials,
} from "../../db/schema/index.js";
import { ApiError } from "../../utils/apiError.js";
import type { Tx } from "./factory.types.js";
import type { CreateMaterialInput, MaterialMovementInput, UpdateMaterialInput } from "./materials.schema.js";

// --- categories & locations (simple lookups) --------------------------------

export function listMaterialCategories() {
  return db.select().from(factoryMaterialCategories).orderBy(factoryMaterialCategories.name);
}

export async function createMaterialCategory(name: string, code: string) {
  const [existing] = await db.select({ id: factoryMaterialCategories.id }).from(factoryMaterialCategories).where(eq(factoryMaterialCategories.name, name)).limit(1);
  if (existing) throw ApiError.conflict(`A material category named "${name}" already exists`);
  const [created] = await db.insert(factoryMaterialCategories).values({ name, code }).returning();
  return created!;
}

export function listLocations() {
  return db.select().from(factoryLocations).orderBy(factoryLocations.name);
}

export async function createLocation(name: string, kind: string) {
  const [existing] = await db.select({ id: factoryLocations.id }).from(factoryLocations).where(eq(factoryLocations.name, name)).limit(1);
  if (existing) throw ApiError.conflict(`A location named "${name}" already exists`);
  const [created] = await db.insert(factoryLocations).values({ name, kind }).returning();
  return created!;
}

// --- materials ---------------------------------------------------------------

export interface MaterialSummary {
  id: string;
  name: string;
  sku: string;
  unit: string;
  reorderLevel: number;
  isActive: boolean;
  categoryId: string;
  categoryName: string;
  currentCostPerUnit: number | null;
  totalStock: number;
  belowReorderLevel: boolean;
}

export async function listMaterials(): Promise<MaterialSummary[]> {
  const rows = await db
    .select({
      id: rawMaterials.id,
      name: rawMaterials.name,
      sku: rawMaterials.sku,
      unit: rawMaterials.unit,
      reorderLevel: rawMaterials.reorderLevel,
      isActive: rawMaterials.isActive,
      categoryId: rawMaterials.categoryId,
      categoryName: factoryMaterialCategories.name,
      currentCostPerUnit: materialCosts.costPerUnit,
      totalStock: sql<string>`coalesce((select sum(${materialStock.quantity}) from ${materialStock} where ${materialStock.materialId} = ${rawMaterials.id}), 0)`,
    })
    .from(rawMaterials)
    .innerJoin(factoryMaterialCategories, eq(factoryMaterialCategories.id, rawMaterials.categoryId))
    .leftJoin(materialCosts, and(eq(materialCosts.materialId, rawMaterials.id), isNull(materialCosts.effectiveTo)))
    .orderBy(rawMaterials.name);

  return rows.map((r) => {
    const totalStock = Number(r.totalStock);
    const reorderLevel = Number(r.reorderLevel);
    return {
      id: r.id,
      name: r.name,
      sku: r.sku,
      unit: r.unit,
      reorderLevel,
      isActive: r.isActive,
      categoryId: r.categoryId,
      categoryName: r.categoryName,
      currentCostPerUnit: r.currentCostPerUnit != null ? Number(r.currentCostPerUnit) : null,
      totalStock,
      belowReorderLevel: totalStock < reorderLevel,
    };
  });
}

export interface MaterialDetail extends MaterialSummary {
  stockByLocation: { locationId: string; locationName: string; quantity: number }[];
  recentMovements: {
    id: string;
    movementType: string;
    quantity: number;
    fromLocationName: string | null;
    toLocationName: string | null;
    notes: string | null;
    createdAt: Date;
  }[];
}

export async function getMaterialDetail(materialId: string): Promise<MaterialDetail> {
  const summary = await listMaterials().then((rows) => rows.find((r) => r.id === materialId));
  if (!summary) throw ApiError.notFound(`Material ${materialId} does not exist`);

  const stockByLocation = await db
    .select({ locationId: materialStock.locationId, locationName: factoryLocations.name, quantity: materialStock.quantity })
    .from(materialStock)
    .innerJoin(factoryLocations, eq(factoryLocations.id, materialStock.locationId))
    .where(eq(materialStock.materialId, materialId));

  const movementRows = await db.execute<{
    id: string;
    movement_type: string;
    quantity: string;
    from_location_name: string | null;
    to_location_name: string | null;
    notes: string | null;
    created_at: Date;
  }>(sql`
    select m.id, m.movement_type, m.quantity, m.notes, m.created_at,
      fl.name as from_location_name, tl.name as to_location_name
    from material_stock_movements m
    left join factory_locations fl on fl.id = m.from_location_id
    left join factory_locations tl on tl.id = m.to_location_id
    where m.material_id = ${materialId}
    order by m.created_at desc
    limit 50
  `);

  return {
    ...summary,
    stockByLocation: stockByLocation.map((s) => ({ ...s, quantity: Number(s.quantity) })),
    recentMovements: movementRows.rows.map((m) => ({
      id: m.id,
      movementType: m.movement_type,
      quantity: Number(m.quantity),
      fromLocationName: m.from_location_name,
      toLocationName: m.to_location_name,
      notes: m.notes,
      createdAt: m.created_at,
    })),
  };
}

export async function createMaterial(input: CreateMaterialInput, actorUserId: string) {
  return db.transaction(async (tx) => {
    const [category] = await tx.select().from(factoryMaterialCategories).where(eq(factoryMaterialCategories.id, input.categoryId)).limit(1);
    if (!category) throw ApiError.notFound(`Material category ${input.categoryId} does not exist`);

    const seqResult = await tx.execute<{ seq: string }>(sql`select nextval('factory_material_sku_seq') as seq`);
    const sequence = Number(seqResult.rows[0]?.seq);
    const sku = `${category.code}-${String(sequence).padStart(5, "0")}`;

    const [material] = await tx
      .insert(rawMaterials)
      .values({
        categoryId: input.categoryId,
        name: input.name,
        sku,
        unit: input.unit,
        reorderLevel: input.reorderLevel.toFixed(3),
      })
      .returning();

    if (input.initialCostPerUnit != null) {
      await tx.insert(materialCosts).values({
        materialId: material!.id,
        costPerUnit: input.initialCostPerUnit.toFixed(4),
        createdBy: actorUserId,
      });
    }

    if (input.initialStock) {
      const [location] = await tx.select().from(factoryLocations).where(eq(factoryLocations.id, input.initialStock.locationId)).limit(1);
      if (!location) throw ApiError.notFound(`Location ${input.initialStock.locationId} does not exist`);

      await tx.insert(materialStock).values({
        materialId: material!.id,
        locationId: input.initialStock.locationId,
        quantity: input.initialStock.quantity.toFixed(3),
      });
      await tx.insert(materialStockMovements).values({
        materialId: material!.id,
        movementType: "receipt",
        quantity: input.initialStock.quantity.toFixed(3),
        toLocationId: input.initialStock.locationId,
        unitCostSnapshot: input.initialCostPerUnit != null ? input.initialCostPerUnit.toFixed(4) : null,
        referenceType: "manual",
        performedBy: actorUserId,
        notes: "Initial stock on material creation",
      });
    }

    return { id: material!.id, sku: material!.sku };
  });
}

export async function updateMaterial(materialId: string, input: UpdateMaterialInput) {
  const [updated] = await db
    .update(rawMaterials)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(input.unit !== undefined ? { unit: input.unit } : {}),
      ...(input.reorderLevel !== undefined ? { reorderLevel: input.reorderLevel.toFixed(3) } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      updatedAt: sql`now()`,
    })
    .where(eq(rawMaterials.id, materialId))
    .returning();
  if (!updated) throw ApiError.notFound(`Material ${materialId} does not exist`);
  return updated;
}

/** Closes the current active cost row and opens a new one — same append-only pattern as the retail catalog's variant cost editor. */
export async function updateMaterialCost(materialId: string, costPerUnit: number, actorUserId: string) {
  return db.transaction(async (tx) => {
    const [material] = await tx.select({ id: rawMaterials.id }).from(rawMaterials).where(eq(rawMaterials.id, materialId)).limit(1);
    if (!material) throw ApiError.notFound(`Material ${materialId} does not exist`);

    await tx
      .update(materialCosts)
      .set({ effectiveTo: sql`now()` })
      .where(and(eq(materialCosts.materialId, materialId), isNull(materialCosts.effectiveTo)));

    const [created] = await tx
      .insert(materialCosts)
      .values({ materialId, costPerUnit: costPerUnit.toFixed(4), createdBy: actorUserId })
      .returning();
    return created!;
  });
}

/** Exported for workOrders.service.ts's BOM-driven auto-issuance, which needs to apply the same balance-adjust-or-throw logic inside its own transaction. */
export async function adjustMaterialBalance(tx: Tx, materialId: string, locationId: string, delta: number): Promise<void> {
  const [existing] = await tx
    .select()
    .from(materialStock)
    .where(and(eq(materialStock.materialId, materialId), eq(materialStock.locationId, locationId)))
    .limit(1);

  const newQuantity = (existing ? Number(existing.quantity) : 0) + delta;
  if (newQuantity < 0) {
    throw ApiError.badRequest(`Not enough stock at this location — has ${existing ? Number(existing.quantity) : 0}, needs ${-delta}`);
  }

  if (existing) {
    await tx.update(materialStock).set({ quantity: newQuantity.toFixed(3), updatedAt: sql`now()` }).where(eq(materialStock.id, existing.id));
  } else {
    await tx.insert(materialStock).values({ materialId, locationId, quantity: newQuantity.toFixed(3) });
  }
}

export async function recordMaterialMovementForMaterial(materialId: string, input: MaterialMovementInput, actorUserId: string) {
  return db.transaction(async (tx) => {
    const [material] = await tx.select({ id: rawMaterials.id }).from(rawMaterials).where(eq(rawMaterials.id, materialId)).limit(1);
    if (!material) throw ApiError.notFound(`Material ${materialId} does not exist`);

    const [activeCost] = await tx
      .select({ costPerUnit: materialCosts.costPerUnit })
      .from(materialCosts)
      .where(and(eq(materialCosts.materialId, materialId), isNull(materialCosts.effectiveTo)))
      .limit(1);

    if (input.movementType === "receipt") {
      await adjustMaterialBalance(tx, materialId, input.toLocationId, input.quantity);
      await tx.insert(materialStockMovements).values({
        materialId,
        movementType: "receipt",
        quantity: input.quantity.toFixed(3),
        toLocationId: input.toLocationId,
        unitCostSnapshot: activeCost?.costPerUnit ?? null,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        performedBy: actorUserId,
        notes: input.notes,
      });
    } else if (input.movementType === "return") {
      await adjustMaterialBalance(tx, materialId, input.toLocationId, input.quantity);
      await tx.insert(materialStockMovements).values({
        materialId,
        movementType: "return",
        quantity: input.quantity.toFixed(3),
        toLocationId: input.toLocationId,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        performedBy: actorUserId,
        notes: input.notes,
      });
    } else if (input.movementType === "issue") {
      await adjustMaterialBalance(tx, materialId, input.fromLocationId, -input.quantity);
      await tx.insert(materialStockMovements).values({
        materialId,
        movementType: "issue",
        quantity: input.quantity.toFixed(3),
        fromLocationId: input.fromLocationId,
        unitCostSnapshot: activeCost?.costPerUnit ?? null,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        performedBy: actorUserId,
        notes: input.notes,
      });
    } else if (input.movementType === "waste") {
      await adjustMaterialBalance(tx, materialId, input.fromLocationId, -input.quantity);
      await tx.insert(materialStockMovements).values({
        materialId,
        movementType: "waste",
        quantity: input.quantity.toFixed(3),
        fromLocationId: input.fromLocationId,
        unitCostSnapshot: activeCost?.costPerUnit ?? null,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        performedBy: actorUserId,
        notes: input.notes,
      });
    } else {
      // adjustment — newQuantity is absolute, so compute the delta first.
      const [existing] = await tx
        .select()
        .from(materialStock)
        .where(and(eq(materialStock.materialId, materialId), eq(materialStock.locationId, input.locationId)))
        .limit(1);
      const delta = input.newQuantity - (existing ? Number(existing.quantity) : 0);
      if (delta !== 0) {
        await adjustMaterialBalance(tx, materialId, input.locationId, delta);
        await tx.insert(materialStockMovements).values({
          materialId,
          movementType: "adjustment",
          quantity: Math.abs(delta).toFixed(3),
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          performedBy: actorUserId,
          notes: input.notes ?? `Stock count adjustment at location (${delta > 0 ? "+" : ""}${delta})`,
        });
      }
    }
  });
}
