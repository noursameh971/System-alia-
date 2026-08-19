import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { getCategories, renameCategoryHandler } from "./categories.controller.js";
import { renameCategorySchema } from "./categories.schema.js";

export const categoriesRouter = Router();

// Categories are shared taxonomy across brands (Step 1 decision) — both roles need the list for filters.
categoriesRouter.get("/", requireAuth, asyncHandler(getCategories));

// The "Manage Categories" modal's rename action — admin only, same as other catalog edits.
categoriesRouter.patch(
  "/:categoryId",
  requireAuth,
  requireRole("admin"),
  validateBody(renameCategorySchema),
  asyncHandler(renameCategoryHandler),
);
