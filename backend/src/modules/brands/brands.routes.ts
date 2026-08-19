import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { rawBody } from "../../middleware/rawBody.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  createBrandHandler,
  getBrandProfileHandler,
  getBrands,
  updateBrandProfileHandler,
  uploadBrandLogoHandler,
} from "./brands.controller.js";
import { createBrandSchema, updateBrandProfileSchema } from "./brands.schema.js";

// The logo upload body is raw bytes, not JSON — see middleware/rawBody.ts.
const rawImageBody = rawBody("6mb");

export const brandsRouter = Router();

// Both roles need the brand list for the UI's brand toggle.
brandsRouter.get("/", requireAuth, asyncHandler(getBrands));

// The "+ New Workspace" modal — admin only, same as every other catalog-level creation action.
brandsRouter.post("/", requireAuth, requireRole("admin"), validateBody(createBrandSchema), asyncHandler(createBrandHandler));

// The Settings page's "Brand Profile" tab — admin only.
brandsRouter.get("/:brandId/profile", requireAuth, requireRole("admin"), asyncHandler(getBrandProfileHandler));
brandsRouter.patch(
  "/:brandId/profile",
  requireAuth,
  requireRole("admin"),
  validateBody(updateBrandProfileSchema),
  asyncHandler(updateBrandProfileHandler),
);
brandsRouter.post("/:brandId/logo", requireAuth, requireRole("admin"), rawImageBody, asyncHandler(uploadBrandLogoHandler));
