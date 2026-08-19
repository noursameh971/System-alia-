import type { Request, Response } from "express";
import { ApiError } from "../../utils/apiError.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { getOrderBrandId } from "../orders/orders.service.js";
import { createReturn, getOrderItemBrandId, listReturns } from "./returns.service.js";
import { listReturnsQuerySchema, type CreateReturnInput, type ListReturnsQuery } from "./returns.schema.js";

/**
 * createReturn's body carries orderItemId, not brandId, so requireBrandAccess
 * can't run at the route level — this resolves the owning order's brand and
 * enforces the same rule by hand. Same pattern as orders.controller's
 * assertBrandAccessForOrder / expenses.controller's assertBrandAccessForExpense.
 */
async function assertBrandAccessForOrderItem(req: Request, orderItemId: string): Promise<void> {
  if (req.user!.role === "admin") return;
  const brandId = await getOrderItemBrandId(orderItemId);
  if (brandId !== req.user!.brandId) {
    throw ApiError.forbidden("You don't have access to that brand's data");
  }
}

export async function postReturn(req: Request, res: Response): Promise<void> {
  const input = req.body as CreateReturnInput;
  await assertBrandAccessForOrderItem(req, input.orderItemId);
  const result = await createReturn(input, req.user!.id);
  sendSuccess(res, 201, result);
}

/**
 * Neither query filter is a plain brandId requireBrandAccess can check up
 * front: ?orderId= (the common case — the order detail page's Returns tab)
 * needs its owning order's brand resolved first; ?brandId= is checked
 * directly. A non-admin request with neither filter would otherwise see
 * every brand's returns, so that's rejected too — same "no implicit
 * all-brands" rule requireBrandAccess enforces elsewhere.
 */
async function assertReturnsQueryScoped(req: Request, filters: ListReturnsQuery): Promise<void> {
  if (req.user!.role === "admin") return;

  if (filters.orderId) {
    const brandId = await getOrderBrandId(filters.orderId);
    if (brandId !== req.user!.brandId) throw ApiError.forbidden("You don't have access to that brand's data");
    return;
  }

  if (filters.brandId) {
    if (filters.brandId !== req.user!.brandId) throw ApiError.forbidden("You don't have access to that brand's data");
    return;
  }

  throw ApiError.forbidden("Pass ?orderId= or ?brandId= to list returns");
}

export async function getReturns(req: Request, res: Response): Promise<void> {
  const parsed = listReturnsQuerySchema.safeParse(req.query);
  if (!parsed.success) throw ApiError.badRequest("Invalid query parameters", parsed.error.flatten());

  await assertReturnsQueryScoped(req, parsed.data);
  sendSuccess(res, 200, await listReturns(parsed.data));
}
