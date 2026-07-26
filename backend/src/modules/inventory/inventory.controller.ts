import type { Request, Response } from "express";
import { sendSuccess } from "../../utils/apiResponse.js";
import { getInventoryForVariant } from "./inventory.service.js";

export async function getVariantInventory(req: Request, res: Response): Promise<void> {
  const variantId = String(req.params.variantId ?? "");
  const rows = await getInventoryForVariant(variantId);
  sendSuccess(res, 200, rows);
}
