import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  getBins,
  getWarehouses,
  getZones,
  postBin,
  postWarehouse,
  postZone,
} from "./warehouse.controller.js";
import { createBinSchema, createWarehouseSchema, createZoneSchema } from "./warehouse.schema.js";

export const warehouseRouter = Router();

// Setting up warehouses/zones/bins is a config task — admin only.
// Reading the layout is something both roles need (staff look up bin codes).
warehouseRouter.get("/", requireAuth, asyncHandler(getWarehouses));
warehouseRouter.post(
  "/",
  requireAuth,
  requireRole("admin"),
  validateBody(createWarehouseSchema),
  asyncHandler(postWarehouse),
);

warehouseRouter.get("/:warehouseId/zones", requireAuth, asyncHandler(getZones));
warehouseRouter.post(
  "/:warehouseId/zones",
  requireAuth,
  requireRole("admin"),
  validateBody(createZoneSchema),
  asyncHandler(postZone),
);

warehouseRouter.get("/zones/:zoneId/bins", requireAuth, asyncHandler(getBins));
warehouseRouter.post(
  "/zones/:zoneId/bins",
  requireAuth,
  requireRole("admin"),
  validateBody(createBinSchema),
  asyncHandler(postBin),
);
