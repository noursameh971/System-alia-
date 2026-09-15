import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { brands, factoryLocations, finishedGoods, finishedGoodsMovements, finishedGoodsStock } from "../../db/schema/index.js";
import { ApiError } from "../../utils/apiError.js";
import type { ShipFinishedGoodInput } from "./finishedGoods.schema.js";

export interface FinishedGoodDetail {
  id: string;
  name: string;
  sku: string;
  unit: string;
  brandId: string | null;
  brandName: string | null;
  isActive: boolean;
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

/** Mirrors materials.service.ts's getMaterialDetail — same stock-by-location + recent-movements shape, one level up the module's own inventory (finished goods rather than raw materials). */
export async function getFinishedGoodDetail(finishedGoodId: string): Promise<FinishedGoodDetail> {
  const [fg] = await db
    .select({
      id: finishedGoods.id,
      name: finishedGoods.name,
      sku: finishedGoods.sku,
      unit: finishedGoods.unit,
      brandId: finishedGoods.brandId,
      brandName: brands.name,
      isActive: finishedGoods.isActive,
    })
    .from(finishedGoods)
    .leftJoin(brands, eq(brands.id, finishedGoods.brandId))
    .where(eq(finishedGoods.id, finishedGoodId))
    .limit(1);
  if (!fg) throw ApiError.notFound(`Finished good ${finishedGoodId} does not exist`);

  const stockByLocation = await db
    .select({ locationId: finishedGoodsStock.locationId, locationName: factoryLocations.name, quantity: finishedGoodsStock.quantity })
    .from(finishedGoodsStock)
    .innerJoin(factoryLocations, eq(factoryLocations.id, finishedGoodsStock.locationId))
    .where(eq(finishedGoodsStock.finishedGoodId, finishedGoodId));

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
    from finished_goods_movements m
    left join factory_locations fl on fl.id = m.from_location_id
    left join factory_locations tl on tl.id = m.to_location_id
    where m.finished_good_id = ${finishedGoodId}
    order by m.created_at desc
    limit 50
  `);

  return {
    ...fg,
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

export async function shipFinishedGoodToBrand(finishedGoodId: string, input: ShipFinishedGoodInput, actorUserId: string) {
  return db.transaction(async (tx) => {
    const [fg] = await tx.select({ id: finishedGoods.id }).from(finishedGoods).where(eq(finishedGoods.id, finishedGoodId)).limit(1);
    if (!fg) throw ApiError.notFound(`Finished good ${finishedGoodId} does not exist`);

    const [brand] = await tx.select({ id: brands.id, name: brands.name }).from(brands).where(eq(brands.id, input.brandId)).limit(1);
    if (!brand) throw ApiError.notFound(`Brand ${input.brandId} does not exist`);

    const [stock] = await tx
      .select()
      .from(finishedGoodsStock)
      .where(and(eq(finishedGoodsStock.finishedGoodId, finishedGoodId), eq(finishedGoodsStock.locationId, input.fromLocationId)))
      .limit(1);
    const current = stock ? Number(stock.quantity) : 0;
    if (current < input.quantity) {
      throw ApiError.badRequest(`Not enough finished-goods stock at this location — has ${current}, needs ${input.quantity}`);
    }

    await tx
      .update(finishedGoodsStock)
      .set({ quantity: (current - input.quantity).toFixed(3), updatedAt: sql`now()` })
      .where(eq(finishedGoodsStock.id, stock!.id));

    await tx.insert(finishedGoodsMovements).values({
      finishedGoodId,
      movementType: "shipment_out",
      quantity: input.quantity.toFixed(3),
      fromLocationId: input.fromLocationId,
      referenceType: "brand",
      referenceId: input.brandId,
      performedBy: actorUserId,
      notes: input.notes ?? `Shipped to ${brand.name}`,
    });

    return { shipped: true };
  });
}
