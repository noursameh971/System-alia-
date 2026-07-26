import type { Request, Response } from "express";
import { ApiError } from "../../utils/apiError.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { createReturn, listReturns } from "./returns.service.js";
import { listReturnsQuerySchema, type CreateReturnInput } from "./returns.schema.js";

export async function postReturn(req: Request, res: Response): Promise<void> {
  const result = await createReturn(req.body as CreateReturnInput, req.user!.id);
  sendSuccess(res, 201, result);
}

export async function getReturns(req: Request, res: Response): Promise<void> {
  const parsed = listReturnsQuerySchema.safeParse(req.query);
  if (!parsed.success) throw ApiError.badRequest("Invalid query parameters", parsed.error.flatten());

  sendSuccess(res, 200, await listReturns(parsed.data));
}
