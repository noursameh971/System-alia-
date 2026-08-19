import { Router } from "express";
import { requireAuth, requireBrandAccess, requireRole } from "../../middleware/auth.js";
import { rawBody } from "../../middleware/rawBody.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { exportOrdersHandler, getOrder, getOrders, importOrdersHandler, patchOrderStatus, postOrder } from "./orders.controller.js";
import { createOrderSchema, updateOrderStatusSchema } from "./orders.schema.js";

// Raw request body as a Buffer for the .xlsx import — see middleware/rawBody.ts.
const rawXlsxBody = rawBody("15mb");

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

// Registered before "/:orderId" so the literal "export"/"import" segments aren't swallowed as an orderId.
// Export: same access as the plain order list. Import: admin only — bulk order creation is a significant write.
ordersRouter.get("/export", requireAuth, requireBrandAccess("query"), asyncHandler(exportOrdersHandler));
ordersRouter.post(
  "/import",
  requireAuth,
  requireRole("admin"),
  requireBrandAccess("query"),
  rawXlsxBody,
  asyncHandler(importOrdersHandler),
);

// Single-order routes carry no brandId in the URL/query, so requireBrandAccess
// can't run here — getOrder/patchOrderStatus resolve the order's own brand
// and enforce access themselves (assertBrandAccessForOrder), same pattern as
// expenses.controller's assertBrandAccessForExpense.
ordersRouter.get("/:orderId", requireAuth, asyncHandler(getOrder));
ordersRouter.patch(
  "/:orderId/status",
  requireAuth,
  validateBody(updateOrderStatusSchema),
  asyncHandler(patchOrderStatus),
);
