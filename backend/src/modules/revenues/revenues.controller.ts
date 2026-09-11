import type { Request, Response } from "express";
import { ApiError } from "../../utils/apiError.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { createRevenue, deleteRevenue, getRevenueBrandId, listRevenues, updateRevenue } from "./revenues.service.js";
import { listRevenuesQuerySchema, type CreateRevenueInput, type UpdateRevenueInput } from "./revenues.schema.js";

/**
 * :id routes carry no brandId, so requireBrandAccess can't run on them —
 * this resolves the row's own brand and enforces the same rule by hand.
 * Admins pass through, exactly as that middleware does.
 */
async function assertBrandAccessForRevenue(req: Request, revenueId: string): Promise<void> {
  if (req.user!.role === "admin") return;
  const brandId = await getRevenueBrandId(revenueId);
  if (brandId !== req.user!.brandId) {
    throw ApiError.forbidden("You don't have access to that brand's data");
  }
}

export async function listRevenuesHandler(req: Request, res: Response): Promise<void> {
  const parsed = listRevenuesQuerySchema.safeParse(req.query);
  if (!parsed.success) throw ApiError.badRequest("Invalid query parameters", parsed.error.flatten());
  sendSuccess(res, 200, await listRevenues(parsed.data));
}

export async function createRevenueHandler(req: Request, res: Response): Promise<void> {
  const input = req.body as CreateRevenueInput;
  sendSuccess(res, 201, await createRevenue(input, req.user!.id));
}

export async function updateRevenueHandler(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id ?? "");
  await assertBrandAccessForRevenue(req, id);
  sendSuccess(res, 200, await updateRevenue(id, req.body as UpdateRevenueInput));
}

export async function deleteRevenueHandler(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id ?? "");
  await assertBrandAccessForRevenue(req, id);
  await deleteRevenue(id);
  sendSuccess(res, 200, { deleted: true });
}
