import type { Request, Response } from "express";
import { ApiError } from "../../utils/apiError.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { listReasonCodesQuerySchema } from "./reasonCodes.schema.js";
import { listReasonCodes } from "./reasonCodes.service.js";

export async function getReasonCodes(req: Request, res: Response): Promise<void> {
  const parsed = listReasonCodesQuerySchema.safeParse(req.query);
  if (!parsed.success) throw ApiError.badRequest("Invalid query parameters", parsed.error.flatten());

  sendSuccess(res, 200, await listReasonCodes(parsed.data.appliesTo));
}
