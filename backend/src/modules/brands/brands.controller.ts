import type { Request, Response } from "express";
import { sendSuccess } from "../../utils/apiResponse.js";
import { listBrands } from "./brands.service.js";

export async function getBrands(req: Request, res: Response): Promise<void> {
  const brandId = req.user?.role === "admin" ? null : req.user?.brandId;
  sendSuccess(res, 200, await listBrands(brandId));
}
