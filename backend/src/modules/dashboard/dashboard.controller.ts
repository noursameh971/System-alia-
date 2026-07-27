import type { Request, Response } from "express";
import { sendSuccess } from "../../utils/apiResponse.js";
import { getDashboardSummary } from "./dashboard.service.js";

export async function getDashboardSummaryHandler(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, 200, await getDashboardSummary());
}
