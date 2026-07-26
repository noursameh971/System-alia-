import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { createProduct, getProducts, getVariantBySkuHandler, getVariantQrCode } from "./products.controller.js";
import { createProductSchema } from "./products.schema.js";

export const productsRouter = Router();

// Both roles browse the catalog; only admins create/catalog new products.
productsRouter.get("/", requireAuth, asyncHandler(getProducts));
productsRouter.post(
  "/",
  requireAuth,
  requireRole("admin"),
  validateBody(createProductSchema),
  asyncHandler(createProduct),
);

// Resolves a scanned/typed SKU to a variant — used by the stock movement forms.
productsRouter.get("/variants/by-sku/:sku", requireAuth, asyncHandler(getVariantBySkuHandler));

// Either role can pull up a variant's QR sticker (e.g. to reprint a damaged label).
productsRouter.get("/variants/:sku/qr-code", requireAuth, asyncHandler(getVariantQrCode));
