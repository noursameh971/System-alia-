import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { productVariants } from "../../db/schema/index.js";
import { ApiError } from "../../utils/apiError.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { generateVariantQrPng } from "../qrcode/qrcode.util.js";
import {
  bulkSetProductsCategory,
  createProductWithVariants,
  createQuickProduct,
  deleteProductVariant,
  getVariantBySku,
  listProductsWithVariants,
  setVariantStock,
  updateProductCategory,
  updateProductCost,
  updateProductPrice,
  updateProductVariant,
} from "./products.service.js";
import { exportProductsWorkbook, importProductRows } from "./products.io.service.js";
import { uploadProductImage } from "./products.image.service.js";
import {
  listProductsQuerySchema,
  type BulkUpdateCategoryInput,
  type CreateProductInput,
  type QuickCreateProductInput,
  type SetVariantStockInput,
  type UpdateProductCategoryInput,
  type UpdateProductCostInput,
  type UpdateProductPriceInput,
  type UpdateProductVariantInput,
} from "./products.schema.js";

export async function createProduct(req: Request, res: Response): Promise<void> {
  const input = req.body as CreateProductInput;
  // requireAuth ran before this handler, so req.user is guaranteed to be set.
  const actorUserId = req.user!.id;

  const product = await createProductWithVariants(input, actorUserId);
  sendSuccess(res, 201, product);
}

/** POST /api/products/quick — the "+ Add Product" modal's create path (one product, one or more variants). */
export async function quickCreateProductHandler(req: Request, res: Response): Promise<void> {
  const input = req.body as QuickCreateProductInput;
  const actorUserId = req.user!.id;

  const result = await createQuickProduct(input, actorUserId);
  sendSuccess(res, 201, result);
}

/** PATCH /api/products/variants/:variantId — the Edit modal's save action. */
export async function updateProductVariantHandler(req: Request, res: Response): Promise<void> {
  const variantId = String(req.params.variantId ?? "");
  const input = req.body as UpdateProductVariantInput;
  const actorUserId = req.user!.id;

  const result = await updateProductVariant(variantId, input, actorUserId);
  sendSuccess(res, 200, result);
}

/** DELETE /api/products/variants/:variantId — the row dropdown's Delete action. */
export async function deleteProductVariantHandler(req: Request, res: Response): Promise<void> {
  const variantId = String(req.params.variantId ?? "");

  const result = await deleteProductVariant(variantId);
  sendSuccess(res, 200, result);
}

/** PATCH /api/products/variants/:variantId/stock — the Product Profile drawer's inline stock editor. */
export async function setVariantStockHandler(req: Request, res: Response): Promise<void> {
  const variantId = String(req.params.variantId ?? "");
  const { quantity } = req.body as SetVariantStockInput;
  const actorUserId = req.user!.id;

  const result = await setVariantStock(variantId, quantity, actorUserId);
  sendSuccess(res, 200, result);
}

/** PATCH /api/products/:productId/price — the drawer's "Update Product Price" field, applies to every variant of the product. */
export async function updateProductPriceHandler(req: Request, res: Response): Promise<void> {
  const productId = String(req.params.productId ?? "");
  const { price } = req.body as UpdateProductPriceInput;
  const actorUserId = req.user!.id;

  const result = await updateProductPrice(productId, price, actorUserId);
  sendSuccess(res, 200, result);
}

/** PATCH /api/products/:productId/cost — the drawer's "Update Production Cost" field, applies to every variant of the product. */
export async function updateProductCostHandler(req: Request, res: Response): Promise<void> {
  const productId = String(req.params.productId ?? "");
  const { cost } = req.body as UpdateProductCostInput;
  const actorUserId = req.user!.id;

  const result = await updateProductCost(productId, cost, actorUserId);
  sendSuccess(res, 200, result);
}

/** PATCH /api/products/:productId/category — the drawer's Category selector, get-or-creates by name and applies to the whole product. */
export async function updateProductCategoryHandler(req: Request, res: Response): Promise<void> {
  const productId = String(req.params.productId ?? "");
  const { category } = req.body as UpdateProductCategoryInput;

  const result = await updateProductCategory(productId, category);
  sendSuccess(res, 200, result);
}

/** PATCH /api/products/bulk/category — the table's bulk-select "Set Category" action. */
export async function bulkUpdateCategoryHandler(req: Request, res: Response): Promise<void> {
  const { productIds, category } = req.body as BulkUpdateCategoryInput;

  const result = await bulkSetProductsCategory(productIds, category);
  sendSuccess(res, 200, result);
}

/** GET /api/products/export?brandId= — downloads a .xlsx of every product/variant/SKU/price/stock. */
export async function exportProductsHandler(req: Request, res: Response): Promise<void> {
  const parsed = listProductsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid query parameters", parsed.error.flatten());
  }

  const buffer = await exportProductsWorkbook(parsed.data.brandId);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="products-export.xlsx"');
  res.send(buffer);
}

/** POST /api/products/import?brandId= — uploads a .xlsx (raw bytes body) to create products or bulk-update price/stock. */
export async function importProductsHandler(req: Request, res: Response): Promise<void> {
  const brandId = String(req.query.brandId ?? "");
  if (!brandId) throw ApiError.badRequest("brandId query parameter is required");
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    throw ApiError.badRequest("Request body must be the raw .xlsx file bytes");
  }
  const actorUserId = req.user!.id;

  const result = await importProductRows(req.body, brandId, actorUserId);
  sendSuccess(res, 200, result);
}

/** POST /api/products/:productId/image — the Add/Edit modal's file-upload path; body is the raw image bytes. */
export async function uploadProductImageHandler(req: Request, res: Response): Promise<void> {
  const productId = String(req.params.productId ?? "");
  if (!Buffer.isBuffer(req.body)) throw ApiError.badRequest("Request body must be the raw image bytes");
  const contentType = req.headers["content-type"] ?? "";

  const result = await uploadProductImage(productId, req.body, contentType);
  sendSuccess(res, 200, result);
}

/** GET /api/products?brandId= — list products with variants, attributes, and current price inlined. */
export async function getProducts(req: Request, res: Response): Promise<void> {
  const parsed = listProductsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid query parameters", parsed.error.flatten());
  }

  const productList = await listProductsWithVariants(parsed.data);
  sendSuccess(res, 200, productList);
}

/** GET /api/products/variants/by-sku/:sku — resolves a scanned/typed SKU to a variant for the movement forms. */
export async function getVariantBySkuHandler(req: Request, res: Response): Promise<void> {
  const sku = String(req.params.sku ?? "");
  if (!sku) throw ApiError.badRequest("SKU is required");

  const variant = await getVariantBySku(sku);
  if (!variant) throw ApiError.notFound(`No variant with SKU ${sku}`);

  sendSuccess(res, 200, variant);
}

/** Serves the printable QR sticker (PNG) for a variant, looked up by SKU. */
export async function getVariantQrCode(req: Request, res: Response): Promise<void> {
  // String(...) avoids passing the route-param's index-signature-derived
  // string type into drizzle's eq() below, which trips a TS7 overload
  // resolution quirk (drizzle infers `never` for the value parameter otherwise).
  const sku = String(req.params.sku ?? "");
  if (!sku) throw ApiError.badRequest("SKU is required");

  const rows = await db
    .select({ sku: productVariants.sku })
    .from(productVariants)
    .where(eq(productVariants.sku, sku))
    .limit(1);
  const variant = rows[0];

  if (!variant) throw ApiError.notFound(`No variant with SKU ${sku}`);

  const png = await generateVariantQrPng(variant.sku);
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Content-Disposition", `inline; filename="${variant.sku}.png"`);
  res.send(png);
}
