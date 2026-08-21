import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { getSettingsHandler, resetDataHandler, updateSettingsHandler } from "./settings.controller.js";
import { resetDataSchema, updateSettingsSchema } from "./settings.schema.js";

export const settingsRouter = Router();

// Both roles read settings (low-stock threshold/currency/date format/language
// all affect rendering everywhere in the app) — only admins can change them.
settingsRouter.get("/", requireAuth, asyncHandler(getSettingsHandler));
settingsRouter.patch(
  "/",
  requireAuth,
  requireRole("admin"),
  validateBody(updateSettingsSchema),
  asyncHandler(updateSettingsHandler),
);

// Danger Zone — admin-only, and the exact confirmation literal is
// re-checked server-side (see settings.schema.ts) so this can never be
// triggered by a bare/scripted request even if the frontend's guard is bypassed.
settingsRouter.post(
  "/reset-data",
  requireAuth,
  requireRole("admin"),
  validateBody(resetDataSchema),
  asyncHandler(resetDataHandler),
);
