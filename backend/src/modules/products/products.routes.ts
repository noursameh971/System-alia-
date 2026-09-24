import { Router } from "express";
import { requireAuth, requireBrandAccess, requireRole } from "../../middleware/auth.js";
import { rawBody } from "../../middleware/rawBody.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  addVariantHandler,
  bulkDeleteProductsHandler,
  bulkUpdateCategoryHandler,
  createProduct,
  deleteProductVariantHandler,
  exportProductsHandler,
  getProducts,
  getVariantBySkuHandler,
  importProductsHandler,
  quickCreateProductHandler,
  reorderProductHandler,
  setVariantStockHandler,
  updateProductCategoryHandler,
  updateProductCostHandler,
  updateProductInfoHandler,
  updateProductPriceHandler,
  updateProductVariantHandler,
  uploadProductImageHandler,
} from "./products.controller.js";
import {
  addVariantSchema,
  bulkDeleteProductsSchema,
  bulkUpdateCategorySchema,
  createProductSchema,
  quickCreateProductSchema,
  reorderProductSchema,
  setVariantStockSchema,
  updateProductCategorySchema,
  updateProductCostSchema,
  updateProductInfoSchema,
  updateProductPriceSchema,
  updateProductVariantSchema,
} from "./products.schema.js";

// Raw request body as a Buffer (the upload is file bytes, not JSON) — see middleware/rawBody.ts.
const rawXlsxBody = rawBody("15mb");

// Same pattern, for the product image upload route. Must stay above
// products.image.service.ts's MAX_IMAGE_BYTES (8MB) — otherwise a photo
// between this limit and that one gets killed by the raw body parser before
// ever reaching that service's friendlier "must be 8MB or smaller" message.
const rawImageBody = rawBody("9mb");

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

// The Products page's "+ Add Product" modal — single-variant create, admin only.
productsRouter.post(
  "/quick",
  requireAuth,
  requireRole("admin"),
  requireBrandAccess("body"),
  validateBody(quickCreateProductSchema),
  asyncHandler(quickCreateProductHandler),
);

// The Product Profile drawer's "Add Variant" modal — admin only, same as the other catalog-editing routes.
productsRouter.post(
  "/:productId/variants",
  requireAuth,
  requireRole("admin"),
  validateBody(addVariantSchema),
  asyncHandler(addVariantHandler),
);

// The "Export Excel" button — both roles, same access as the plain product list.
productsRouter.get("/export", requireAuth, requireBrandAccess("query"), asyncHandler(exportProductsHandler));

// The "Import Excel" button — admin only, since it can create/edit catalog rows. Raw body, not JSON: see rawXlsxBody above.
productsRouter.post(
  "/import",
  requireAuth,
  requireRole("admin"),
  requireBrandAccess("query"),
  rawXlsxBody,
  asyncHandler(importProductsHandler),
);

// The products table's bulk-select "Set Category" action — admin only, same as the row-level catalog edits.
// Registered before "/:productId/category" so the literal "bulk" segment isn't swallowed as a :productId.
productsRouter.patch(
  "/bulk/category",
  requireAuth,
  requireRole("admin"),
  validateBody(bulkUpdateCategorySchema),
  asyncHandler(bulkUpdateCategoryHandler),
);

// The products table's bulk-select "Delete Selected" action — admin only, same as the row-level Delete.
productsRouter.delete(
  "/bulk",
  requireAuth,
  requireRole("admin"),
  validateBody(bulkDeleteProductsSchema),
  asyncHandler(bulkDeleteProductsHandler),
);

// The Products page's row-level Edit/Delete actions — admin only, same as create.
productsRouter.patch(
  "/variants/:variantId",
  requireAuth,
  requireRole("admin"),
  validateBody(updateProductVariantSchema),
  asyncHandler(updateProductVariantHandler),
);
productsRouter.delete(
  "/variants/:variantId",
  requireAuth,
  requireRole("admin"),
  asyncHandler(deleteProductVariantHandler),
);

// Inline stock editing in the Product Profile drawer — day-to-day stock
// work, same as /api/stock-movements, so both roles may call it (unlike the
// admin-only catalog edits above).
productsRouter.patch(
  "/variants/:variantId/stock",
  requireAuth,
  validateBody(setVariantStockSchema),
  asyncHandler(setVariantStockHandler),
);

// The Products page's per-row up/down move buttons — admin only, same as the other row-level catalog edits.
productsRouter.patch(
  "/:productId/reorder",
  requireAuth,
  requireRole("admin"),
  validateBody(reorderProductSchema),
  asyncHandler(reorderProductHandler),
);

// The Product Profile drawer's "Update Product Price" field — admin only, same as the row-level catalog edits.
productsRouter.patch(
  "/:productId/price",
  requireAuth,
  requireRole("admin"),
  validateBody(updateProductPriceSchema),
  asyncHandler(updateProductPriceHandler),
);

// The Product Profile drawer's "Update Production Cost" field — admin only, same as price (production cost is sensitive business data).
productsRouter.patch(
  "/:productId/cost",
  requireAuth,
  requireRole("admin"),
  validateBody(updateProductCostSchema),
  asyncHandler(updateProductCostHandler),
);

// The Product Profile drawer's Category selector — admin only, same as the row-level catalog edits.
productsRouter.patch(
  "/:productId/category",
  requireAuth,
  requireRole("admin"),
  validateBody(updateProductCategorySchema),
  asyncHandler(updateProductCategoryHandler),
);

// The Product Profile drawer's "Edit Product" modal — name/image, admin only, same as the other product-level fields.
productsRouter.patch(
  "/:productId/info",
  requireAuth,
  requireRole("admin"),
  validateBody(updateProductInfoSchema),
  asyncHandler(updateProductInfoHandler),
);

// The Add/Edit modal's file-upload image path — admin only. Raw body, not JSON: see rawImageBody above.
productsRouter.post(
  "/:productId/image",
  requireAuth,
  requireRole("admin"),
  rawImageBody,
  asyncHandler(uploadProductImageHandler),
);

// Resolves a scanned/typed SKU to a variant — used by the stock movement forms.
productsRouter.get("/variants/by-sku/:sku", requireAuth, asyncHandler(getVariantBySkuHandler));
