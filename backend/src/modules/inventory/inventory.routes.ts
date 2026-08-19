import { Router } from "express";
import { requireAuth, requireBrandAccess } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { getInventoryList, getVariantInventory } from "./inventory.controller.js";

export const inventoryRouter = Router();

inventoryRouter.get("/", requireAuth, requireBrandAccess("query"), asyncHandler(getInventoryList));
// Single-variant lookup has no brandId to check here — the variant's own
// brand is opaque until inventory.service.ts resolves it, so this route
// relies on requireAuth alone for now (see backend/README.md follow-ups).
inventoryRouter.get("/variants/:variantId", requireAuth, asyncHandler(getVariantInventory));
