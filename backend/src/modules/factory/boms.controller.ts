import type { Request, Response } from "express";
import { sendSuccess } from "../../utils/apiResponse.js";
import type { CreateBomInput, CreateFinishedGoodInput } from "./boms.schema.js";
import {
  computeMaterialRequirements,
  createBom,
  createFinishedGood,
  getBom,
  listBoms,
  listFinishedGoods,
  updateBomStatus,
} from "./boms.service.js";

export async function getFinishedGoods(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, 200, await listFinishedGoods());
}

export async function createFinishedGoodHandler(req: Request, res: Response): Promise<void> {
  sendSuccess(res, 201, await createFinishedGood(req.body as CreateFinishedGoodInput));
}

export async function getBoms(req: Request, res: Response): Promise<void> {
  const finishedGoodId = typeof req.query.finishedGoodId === "string" ? req.query.finishedGoodId : undefined;
  sendSuccess(res, 200, await listBoms(finishedGoodId));
}

export async function getBomHandler(req: Request, res: Response): Promise<void> {
  const bomId = String(req.params.bomId ?? "");
  sendSuccess(res, 200, await getBom(bomId));
}

export async function createBomHandler(req: Request, res: Response): Promise<void> {
  sendSuccess(res, 201, await createBom(req.body as CreateBomInput, req.user!.id));
}

export async function updateBomStatusHandler(req: Request, res: Response): Promise<void> {
  const bomId = String(req.params.bomId ?? "");
  const { status } = req.body as { status: string };
  sendSuccess(res, 200, await updateBomStatus(bomId, status));
}

export async function getMaterialRequirementsHandler(req: Request, res: Response): Promise<void> {
  const bomId = String(req.params.bomId ?? "");
  const quantityOrdered = Number(req.query.quantityOrdered);
  sendSuccess(res, 200, await computeMaterialRequirements(bomId, quantityOrdered));
}
