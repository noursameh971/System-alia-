import type { Request, Response } from "express";
import { sendSuccess } from "../../utils/apiResponse.js";
import { getFactoryDashboardSummary } from "./dashboard.service.js";

export async function getFactoryDashboard(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, 200, await getFactoryDashboardSummary());
}
