import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { warehouseBins, warehouseZones, warehouses } from "../../db/schema/index.js";
import { ApiError } from "../../utils/apiError.js";
import { withUniqueConstraint } from "../../utils/pgErrors.js";
import type { CreateBinInput, CreateWarehouseInput, CreateZoneInput } from "./warehouse.schema.js";

export async function listWarehouses() {
  return db.select().from(warehouses);
}

export async function createWarehouse(input: CreateWarehouseInput) {
  const [warehouse] = await db
    .insert(warehouses)
    .values({ name: input.name, address: input.address ?? null })
    .returning();
  if (!warehouse) throw new Error("Warehouse insert returned no row"); // unreachable
  return warehouse;
}

export async function listZones(warehouseId: string) {
  return db.select().from(warehouseZones).where(eq(warehouseZones.warehouseId, warehouseId));
}

export async function createZone(warehouseId: string, input: CreateZoneInput) {
  const [warehouse] = await db.select().from(warehouses).where(eq(warehouses.id, warehouseId)).limit(1);
  if (!warehouse) throw ApiError.notFound(`Warehouse ${warehouseId} does not exist`);

  return withUniqueConstraint(`Zone code "${input.code}" already exists in this warehouse`, async () => {
    const [zone] = await db
      .insert(warehouseZones)
      .values({ warehouseId, code: input.code, name: input.name ?? null })
      .returning();
    if (!zone) throw new Error("Zone insert returned no row"); // unreachable
    return zone;
  });
}

export async function listBins(zoneId: string) {
  return db.select().from(warehouseBins).where(eq(warehouseBins.zoneId, zoneId));
}

export async function createBin(zoneId: string, input: CreateBinInput) {
  const [zone] = await db.select().from(warehouseZones).where(eq(warehouseZones.id, zoneId)).limit(1);
  if (!zone) throw ApiError.notFound(`Zone ${zoneId} does not exist`);

  return withUniqueConstraint(`Bin code "${input.code}" already exists in this zone`, async () => {
    const [bin] = await db.insert(warehouseBins).values({ zoneId, code: input.code }).returning();
    if (!bin) throw new Error("Bin insert returned no row"); // unreachable
    return bin;
  });
}
