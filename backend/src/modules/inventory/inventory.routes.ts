import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { getVariantInventory } from "./inventory.controller.js";

export const inventoryRouter = Router();

inventoryRouter.get("/variants/:variantId", requireAuth, asyncHandler(getVariantInventory));
