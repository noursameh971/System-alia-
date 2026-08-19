import type { Request, Response } from "express";
import { ApiError } from "../../utils/apiError.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import {
  listMovementsForVariant,
  listRecentMovementsForBrand,
  recordBatchMovement,
  recordInboundMovement,
  recordOutboundMovement,
  recordReturnMovement,
  recordTransferMovement,
} from "./stockMovements.service.js";
import type {
  BatchMovementInput,
  InboundMovementInput,
  OutboundMovementInput,
  ReturnMovementInput,
  TransferMovementInput,
} from "./stockMovements.schema.js";

export async function createInboundMovement(req: Request, res: Response): Promise<void> {
  const result = await recordInboundMovement(req.body as InboundMovementInput, req.user!.id);
  sendSuccess(res, 201, result);
}

export async function createOutboundMovement(req: Request, res: Response): Promise<void> {
  const result = await recordOutboundMovement(req.body as OutboundMovementInput, req.user!.id);
  sendSuccess(res, 201, result);
}

export async function createTransferMovement(req: Request, res: Response): Promise<void> {
  const result = await recordTransferMovement(req.body as TransferMovementInput, req.user!.id);
  sendSuccess(res, 201, result);
}

export async function createReturnMovement(req: Request, res: Response): Promise<void> {
  const result = await recordReturnMovement(req.body as ReturnMovementInput, req.user!.id);
  sendSuccess(res, 201, result);
}

export async function getVariantMovementHistory(req: Request, res: Response): Promise<void> {
  const variantId = String(req.params.variantId ?? "");
  const movements = await listMovementsForVariant(variantId);
  sendSuccess(res, 200, movements);
}

/** POST /api/stock-movements/batch — the Inventory page's "Execute Batch Action" button. */
export async function createBatchMovement(req: Request, res: Response): Promise<void> {
  const result = await recordBatchMovement(req.body as BatchMovementInput, req.user!.id);
  sendSuccess(res, 201, result);
}

/** GET /api/stock-movements/recent?brandId= — the Inventory page's "Recent Movements Log". */
export async function getRecentMovements(req: Request, res: Response): Promise<void> {
  const brandId = String(req.query.brandId ?? "");
  if (!brandId) throw ApiError.badRequest("brandId query parameter is required");
  const limit = req.query.limit ? Number(req.query.limit) : undefined;

  const movements = await listRecentMovementsForBrand(brandId, limit);
  sendSuccess(res, 200, movements);
}
