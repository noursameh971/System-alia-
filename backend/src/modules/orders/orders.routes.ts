import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { getOrder, getOrders, postOrder } from "./orders.controller.js";
import { createOrderSchema } from "./orders.schema.js";

export const ordersRouter = Router();

// Placing/viewing orders is a normal warehouse/counter task for both roles,
// same as stock movements — not gated to admin.
ordersRouter.get("/", requireAuth, asyncHandler(getOrders));
ordersRouter.post("/", requireAuth, validateBody(createOrderSchema), asyncHandler(postOrder));
ordersRouter.get("/:orderId", requireAuth, asyncHandler(getOrder));
