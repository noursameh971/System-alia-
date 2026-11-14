import { Router } from "express";
import { requireAuth, requireBrandAccess, requireRole } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  createBatchMovement,
  createInboundMovement,
  createOutboundMovement,
  createReturnMovement,
  createTransferMovement,
  getRecentMovements,
  getVariantMovementHistory,
  revertStockMovements,
} from "./stockMovements.controller.js";
import {
  batchMovementSchema,
  inboundMovementSchema,
  outboundMovementSchema,
  returnMovementSchema,
  revertMovementsSchema,
  transferMovementSchema,
} from "./stockMovements.schema.js";

export const stockMovementsRouter = Router();

// Recording movements is warehouse staff's core day-to-day job — both roles
// may call these, unlike catalog/warehouse-config endpoints (admin-only).
stockMovementsRouter.post(
  "/inbound",
  requireAuth,
  validateBody(inboundMovementSchema),
  asyncHandler(createInboundMovement),
);
stockMovementsRouter.post(
  "/outbound",
  requireAuth,
  validateBody(outboundMovementSchema),
  asyncHandler(createOutboundMovement),
);
stockMovementsRouter.post(
  "/transfer",
  requireAuth,
  validateBody(transferMovementSchema),
  asyncHandler(createTransferMovement),
);
stockMovementsRouter.post(
  "/returns",
  requireAuth,
  validateBody(returnMovementSchema),
  asyncHandler(createReturnMovement),
);

stockMovementsRouter.get(
  "/variants/:variantId",
  requireAuth,
  asyncHandler(getVariantMovementHistory),
);

// The Inventory page's Scanned Batch Queue — one transaction for the whole
// scan, same "both roles" access as the single-item routes above.
stockMovementsRouter.post(
  "/batch",
  requireAuth,
  validateBody(batchMovementSchema),
  asyncHandler(createBatchMovement),
);

// The Inventory page's "Recent Movements Log" — brand-scoped (unlike the
// single-item routes, which have no brand check at all today).
stockMovementsRouter.get(
  "/recent",
  requireAuth,
  requireBrandAccess("query"),
  asyncHandler(getRecentMovements),
);

// Revert / Undo is admin-only — unlike recording movements, it rewrites
// stock that someone else counted, so warehouse staff can't use it.
stockMovementsRouter.post(
  "/revert",
  requireAuth,
  requireRole("admin"),
  requireBrandAccess("body"),
  validateBody(revertMovementsSchema),
  asyncHandler(revertStockMovements),
);
