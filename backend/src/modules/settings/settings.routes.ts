import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  deleteShippingRateHandler,
  getSettingsHandler,
  getShippingRatesHandler,
  updateSettingsHandler,
  upsertShippingRateHandler,
} from "./settings.controller.js";
import { updateSettingsSchema, upsertShippingRateSchema } from "./settings.schema.js";

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

settingsRouter.get("/shipping-rates", requireAuth, asyncHandler(getShippingRatesHandler));
settingsRouter.put(
  "/shipping-rates",
  requireAuth,
  requireRole("admin"),
  validateBody(upsertShippingRateSchema),
  asyncHandler(upsertShippingRateHandler),
);
settingsRouter.delete("/shipping-rates/:id", requireAuth, requireRole("admin"), asyncHandler(deleteShippingRateHandler));
