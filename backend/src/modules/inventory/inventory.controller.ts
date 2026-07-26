import type { Request, Response } from "express";
import { ApiError } from "../../utils/apiError.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { listInventoryQuerySchema } from "./inventory.schema.js";
import { getInventoryForVariant, listInventory } from "./inventory.service.js";

export async function getVariantInventory(req: Request, res: Response): Promise<void> {
  const variantId = String(req.params.variantId ?? "");
  const rows = await getInventoryForVariant(variantId);
  sendSuccess(res, 200, rows);
}

/** GET /api/inventory?brandId=&categoryId=&zoneId=&binId= — the Inventory dashboard's data source. */
export async function getInventoryList(req: Request, res: Response): Promise<void> {
  const parsed = listInventoryQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid query parameters", parsed.error.flatten());
  }

  const rows = await listInventory(parsed.data);
  sendSuccess(res, 200, rows);
}
