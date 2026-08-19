import type { Request, Response } from "express";
import { ApiError } from "../../utils/apiError.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { exportOrdersWorkbook, importOrderRows } from "./orders.io.service.js";
import { createOrder, getOrderBrandId, getOrderById, listOrders, updateOrderStatus } from "./orders.service.js";
import { listOrdersQuerySchema, type CreateOrderInput, type UpdateOrderStatusInput } from "./orders.schema.js";

/**
 * :orderId routes carry no brandId, so requireBrandAccess can't run on them —
 * this resolves the order's own brand and enforces the same rule by hand.
 * Same pattern as expenses.controller's assertBrandAccessForExpense.
 */
async function assertBrandAccessForOrder(req: Request, orderId: string): Promise<void> {
  if (req.user!.role === "admin") return;
  const brandId = await getOrderBrandId(orderId);
  if (brandId !== req.user!.brandId) {
    throw ApiError.forbidden("You don't have access to that brand's data");
  }
}

export async function postOrder(req: Request, res: Response): Promise<void> {
  const order = await createOrder(req.body as CreateOrderInput, req.user!.id);
  sendSuccess(res, 201, order);
}

export async function getOrders(req: Request, res: Response): Promise<void> {
  const parsed = listOrdersQuerySchema.safeParse(req.query);
  if (!parsed.success) throw ApiError.badRequest("Invalid query parameters", parsed.error.flatten());

  sendSuccess(res, 200, await listOrders(parsed.data));
}

export async function getOrder(req: Request, res: Response): Promise<void> {
  const orderId = String(req.params.orderId ?? "");
  await assertBrandAccessForOrder(req, orderId);
  const order = await getOrderById(orderId);
  if (!order) throw ApiError.notFound(`No order with id ${orderId}`);
  sendSuccess(res, 200, order);
}

export async function patchOrderStatus(req: Request, res: Response): Promise<void> {
  const orderId = String(req.params.orderId ?? "");
  await assertBrandAccessForOrder(req, orderId);
  const { status } = req.body as UpdateOrderStatusInput;
  const order = await updateOrderStatus(orderId, status);
  if (!order) throw ApiError.notFound(`No order with id ${orderId}`);
  sendSuccess(res, 200, order);
}

/** GET /api/orders/export?brandId= — the Orders page's "Export Excel" button. */
export async function exportOrdersHandler(req: Request, res: Response): Promise<void> {
  const brandId = req.query.brandId ? String(req.query.brandId) : undefined;

  const buffer = await exportOrdersWorkbook(brandId);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="orders-export.xlsx"');
  res.send(buffer);
}

/** POST /api/orders/import?brandId= — uploads a .xlsx (raw bytes body) to bulk-create orders. */
export async function importOrdersHandler(req: Request, res: Response): Promise<void> {
  const brandId = String(req.query.brandId ?? "");
  if (!brandId) throw ApiError.badRequest("brandId query parameter is required");
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    throw ApiError.badRequest("Request body must be the raw .xlsx file bytes");
  }

  const result = await importOrderRows(req.body, brandId, req.user!.id);
  sendSuccess(res, 200, result);
}
