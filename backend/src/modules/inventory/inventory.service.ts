import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { inventory, warehouseBins, warehouseZones } from "../../db/schema/index.js";

export async function getInventoryForVariant(variantId: string) {
  return db
    .select({
      binId: inventory.binId,
      binCode: warehouseBins.code,
      zoneCode: warehouseZones.code,
      quantity: inventory.quantity,
      updatedAt: inventory.updatedAt,
    })
    .from(inventory)
    .innerJoin(warehouseBins, eq(warehouseBins.id, inventory.binId))
    .innerJoin(warehouseZones, eq(warehouseZones.id, warehouseBins.zoneId))
    .where(eq(inventory.variantId, variantId));
}
