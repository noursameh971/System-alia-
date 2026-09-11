import { Router } from "express";
import { requireAuth, requireBrandAccess, requireRole } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  createRevenueHandler,
  deleteRevenueHandler,
  listRevenuesHandler,
  updateRevenueHandler,
} from "./revenues.controller.js";
import { createRevenueSchema, updateRevenueSchema } from "./revenues.schema.js";

export const revenuesRouter = Router();

/**
 * Same access rule as /api/expenses: admin and finance roles only, still
 * brand-scoped via requireBrandAccess for the finance role.
 */

revenuesRouter.get(
  "/",
  requireAuth,
  requireRole("admin", "finance"),
  requireBrandAccess("query"),
  asyncHandler(listRevenuesHandler),
);

revenuesRouter.post(
  "/",
  requireAuth,
  requireRole("admin", "finance"),
  requireBrandAccess("body"),
  validateBody(createRevenueSchema),
  asyncHandler(createRevenueHandler),
);

// PATCH/DELETE carry no brandId, so the handler resolves the row's own brand
// and enforces access there — see assertBrandAccessForRevenue.
revenuesRouter.patch(
  "/:id",
  requireAuth,
  requireRole("admin", "finance"),
  validateBody(updateRevenueSchema),
  asyncHandler(updateRevenueHandler),
);

revenuesRouter.delete("/:id", requireAuth, requireRole("admin", "finance"), asyncHandler(deleteRevenueHandler));
