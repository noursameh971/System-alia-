import type { Request, Response } from "express";
import { ApiError } from "../../utils/apiError.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { createOrder, getOrderById, listOrders } from "./orders.service.js";
import { listOrdersQuerySchema, type CreateOrderInput } from "./orders.schema.js";

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
  const order = await getOrderById(orderId);
  if (!order) throw ApiError.notFound(`No order with id ${orderId}`);
  sendSuccess(res, 200, order);
}
