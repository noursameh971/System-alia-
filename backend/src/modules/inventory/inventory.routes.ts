import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { getInventoryList, getVariantInventory } from "./inventory.controller.js";

export const inventoryRouter = Router();

inventoryRouter.get("/", requireAuth, asyncHandler(getInventoryList));
inventoryRouter.get("/variants/:variantId", requireAuth, asyncHandler(getVariantInventory));
