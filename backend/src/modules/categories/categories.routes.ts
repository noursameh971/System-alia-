import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { getCategories } from "./categories.controller.js";

export const categoriesRouter = Router();

// Categories are shared taxonomy across brands (Step 1 decision) — both roles need the list for filters.
categoriesRouter.get("/", requireAuth, asyncHandler(getCategories));
