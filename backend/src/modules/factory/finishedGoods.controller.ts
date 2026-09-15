import type { Request, Response } from "express";
import { sendSuccess } from "../../utils/apiResponse.js";
import { getFinishedGoodDetail, shipFinishedGoodToBrand } from "./finishedGoods.service.js";
import type { ShipFinishedGoodInput } from "./finishedGoods.schema.js";

export async function getFinishedGoodDetailHandler(req: Request, res: Response): Promise<void> {
  const finishedGoodId = String(req.params.finishedGoodId ?? "");
  sendSuccess(res, 200, await getFinishedGoodDetail(finishedGoodId));
}

export async function shipFinishedGoodHandler(req: Request, res: Response): Promise<void> {
  const finishedGoodId = String(req.params.finishedGoodId ?? "");
  sendSuccess(res, 201, await shipFinishedGoodToBrand(finishedGoodId, req.body as ShipFinishedGoodInput, req.user!.id));
}
