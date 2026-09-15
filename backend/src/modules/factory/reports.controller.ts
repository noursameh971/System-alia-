import type { Request, Response } from "express";
import { sendSuccess } from "../../utils/apiResponse.js";
import { getCostingReport, getMrpReport, getScrapReport } from "./reports.service.js";

export async function getMrpReportHandler(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, 200, await getMrpReport());
}

export async function getScrapReportHandler(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, 200, await getScrapReport());
}

export async function getCostingReportHandler(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, 200, await getCostingReport());
}
