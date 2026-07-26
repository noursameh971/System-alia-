import type { Request, Response } from "express";
import { sendSuccess } from "../../utils/apiResponse.js";
import { listCategories } from "./categories.service.js";

export async function getCategories(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, 200, await listCategories());
}
