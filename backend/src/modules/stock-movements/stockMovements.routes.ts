import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  createInboundMovement,
  createOutboundMovement,
  createReturnMovement,
  createTransferMovement,
  getVariantMovementHistory,
} from "./stockMovements.controller.js";
import {
  inboundMovementSchema,
  outboundMovementSchema,
  returnMovementSchema,
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
