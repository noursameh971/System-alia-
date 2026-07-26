import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { getBrands } from "./brands.controller.js";

export const brandsRouter = Router();

// Both roles need the brand list for the UI's brand toggle.
brandsRouter.get("/", requireAuth, asyncHandler(getBrands));
