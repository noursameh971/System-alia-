import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { productVariants } from "../../db/schema/index.js";
import { ApiError } from "../../utils/apiError.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { generateVariantQrPng } from "../qrcode/qrcode.util.js";
import { createProductWithVariants, getVariantBySku, listProductsWithVariants } from "./products.service.js";
import { listProductsQuerySchema, type CreateProductInput } from "./products.schema.js";

export async function createProduct(req: Request, res: Response): Promise<void> {
  const input = req.body as CreateProductInput;
  // requireAuth ran before this handler, so req.user is guaranteed to be set.
  const actorUserId = req.user!.id;

  const product = await createProductWithVariants(input, actorUserId);
  sendSuccess(res, 201, product);
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
