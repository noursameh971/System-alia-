import type { Request, Response } from "express";
import { ApiError } from "../../utils/apiError.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { getBrandDashboardSummary, getDashboardSummary } from "./dashboard.service.js";

export async function getDashboardSummaryHandler(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, 200, await getDashboardSummary());
}

/** GET /api/dashboard/brand-summary?brandId= — the brand-scoped dashboard page's data. */
export async function getBrandDashboardSummaryHandler(req: Request, res: Response): Promise<void> {
  const brandId = String(req.query.brandId ?? "");
  if (!brandId) throw ApiError.badRequest("brandId query parameter is required");

  sendSuccess(res, 200, await getBrandDashboardSummary(brandId));
}
