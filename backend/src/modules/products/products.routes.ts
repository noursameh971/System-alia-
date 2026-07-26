import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { createProduct, getVariantQrCode } from "./products.controller.js";
import { createProductSchema } from "./products.schema.js";

export const productsRouter = Router();

// Only admins create/catalog new products — warehouse staff work stock, not the catalog.
productsRouter.post(
  "/",
  requireAuth,
  requireRole("admin"),
  validateBody(createProductSchema),
  asyncHandler(createProduct),
);

// Either role can pull up a variant's QR sticker (e.g. to reprint a damaged label).
productsRouter.get("/variants/:sku/qr-code", requireAuth, asyncHandler(getVariantQrCode));
