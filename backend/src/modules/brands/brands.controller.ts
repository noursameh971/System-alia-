import type { Request, Response } from "express";
import { sendSuccess } from "../../utils/apiResponse.js";
import { listBrands } from "./brands.service.js";

export async function getBrands(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, 200, await listBrands());
}
