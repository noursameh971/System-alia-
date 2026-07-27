import { Router } from "express";
import { requireAuth, requireBrandAccess } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { getOrder, getOrders, postOrder } from "./orders.controller.js";
import { createOrderSchema } from "./orders.schema.js";

export const ordersRouter = Router();

// Placing/viewing orders is a normal warehouse/counter task for both roles,
// same as stock movements — not gated to admin, but still brand-scoped for
// warehouse_staff via requireBrandAccess.
ordersRouter.get("/", requireAuth, requireBrandAccess("query"), asyncHandler(getOrders));
ordersRouter.post(
  "/",
  requireAuth,
  requireBrandAccess("body"),
  validateBody(createOrderSchema),
  asyncHandler(postOrder),
);
// Single-order lookup: brand isn't known until the order is fetched, so this
// relies on requireAuth alone for now (see backend/README.md follow-ups).
ordersRouter.get("/:orderId", requireAuth, asyncHandler(getOrder));
