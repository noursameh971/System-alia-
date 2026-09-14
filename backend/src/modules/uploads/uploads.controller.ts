import type { Request, Response } from "express";
import { ApiError } from "../../utils/apiError.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { uploadReceiptFile } from "./uploads.image.service.js";

/** The Add Expense / Add Opening Balance modals' file-upload receipt path — raw body, not JSON: see rawReceiptBody in uploads.routes.ts. */
export async function uploadReceiptHandler(req: Request, res: Response): Promise<void> {
  if (!Buffer.isBuffer(req.body)) throw ApiError.badRequest("Request body must be the raw file bytes");
  const contentType = req.headers["content-type"] ?? "";

  const result = await uploadReceiptFile(req.body, contentType);
  sendSuccess(res, 200, result);
}
