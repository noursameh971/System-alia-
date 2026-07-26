import type { Request, Response } from "express";
import { sendSuccess } from "../../utils/apiResponse.js";
import {
  listMovementsForVariant,
  recordInboundMovement,
  recordOutboundMovement,
  recordReturnMovement,
  recordTransferMovement,
} from "./stockMovements.service.js";
import type {
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
