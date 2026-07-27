import { Router } from "express";
import { requireAuth, requireBrandAccess, requireRole } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { createProduct, getProducts, getVariantBySkuHandler, getVariantQrCode } from "./products.controller.js";
import { createProductSchema } from "./products.schema.js";

export const productsRouter = Router();

// Both roles browse the catalog; only admins create/catalog new products.
// requireBrandAccess: a warehouse_staff caller must pass their own
// workspace's brandId — no-op for admins.
productsRouter.get("/", requireAuth, requireBrandAccess("query"), asyncHandler(getProducts));
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
