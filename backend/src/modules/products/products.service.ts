import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import {
  attributeValues,
  attributes,
  brands,
  categories,
  productVariants,
  products,
  variantAttributeValues,
  variantPrices,
} from "../../db/schema/index.js";
import { ApiError } from "../../utils/apiError.js";
import { attributeSignature, buildVariantSku } from "../../utils/skuGenerator.js";
import { buildQrPayload } from "../qrcode/qrcode.util.js";
import type { CreateProductInput } from "./products.schema.js";

export interface CreatedVariant {
  id: string;
  sku: string;
  qrCodeValue: string;
  attributeValueIds: string[];
  price: number | null;
  currency: string | null;
}

export interface CreatedProduct {
  id: string;
  brandId: string;
  categoryId: string;
  name: string;
  description: string | null;
  variants: CreatedVariant[];
}

export async function createProductWithVariants(
  input: CreateProductInput,
  actorUserId: string,
): Promise<CreatedProduct> {
  // Reject duplicate variants (same attribute-value combination) within the
  // same request up front — cheaper than letting the DB fail mid-transaction.
  const seenSignatures = new Set<string>();
  for (const variant of input.variants) {
    const signature = attributeSignature(variant.attributeValueIds);
    if (seenSignatures.has(signature)) {
      throw ApiError.badRequest("Duplicate variant: two variants have the same attribute combination");
    }
    seenSignatures.add(signature);
  }

  return db.transaction(async (tx) => {
    const [brand] = await tx.select().from(brands).where(eq(brands.id, input.brandId)).limit(1);
    if (!brand) throw ApiError.badRequest(`Brand ${input.brandId} does not exist`);

    const [category] = await tx
      .select()
      .from(categories)
      .where(eq(categories.id, input.categoryId))
      .limit(1);
    if (!category) throw ApiError.badRequest(`Category ${input.categoryId} does not exist`);

    // All attribute values referenced across every variant, fetched once.
    const requestedAttributeValueIds = [...seenSignatures]
      .flatMap((sig) => sig.split("|"))
      .filter((id, i, arr) => arr.indexOf(id) === i);

    const foundAttributeValues = await tx
      .select({
        id: attributeValues.id,
        code: attributeValues.code,
        attributeName: attributes.name,
      })
      .from(attributeValues)
      .innerJoin(attributes, eq(attributes.id, attributeValues.attributeId))
      .where(inArray(attributeValues.id, requestedAttributeValueIds));

    if (foundAttributeValues.length !== requestedAttributeValueIds.length) {
      const foundIds = new Set(foundAttributeValues.map((v) => v.id));
      const missing = requestedAttributeValueIds.filter((id) => !foundIds.has(id));
      throw ApiError.badRequest("Unknown attribute value id(s)", { missing });
    }
    const attributeValueById = new Map(foundAttributeValues.map((v) => [v.id, v]));

    const [product] = await tx
      .insert(products)
      .values({
        brandId: input.brandId,
        categoryId: input.categoryId,
        name: input.name,
        description: input.description ?? null,
      })
      .returning();
    if (!product) throw new Error("Product insert returned no row");

    // One sequence value per product — every variant of this product shares
    // it, differentiated by the attribute codes appended to the SKU.
    const seqResult = await tx.execute<{ seq: string }>(sql`select nextval('product_sku_seq') as seq`);
    const sequence = Number(seqResult.rows[0]?.seq);

    const createdVariants: CreatedVariant[] = [];

    for (const variantInput of input.variants) {
      const resolvedAttributeValues = variantInput.attributeValueIds.map((id) => {
        const value = attributeValueById.get(id);
        if (!value) throw new Error(`Attribute value ${id} missing after validation`); // unreachable
        return value;
      });

      const attributeCodes = [...resolvedAttributeValues]
        .sort((a, b) => a.attributeName.localeCompare(b.attributeName))
        .map((v) => v.code);

      const sku = buildVariantSku({
        brandCode: brand.code,
        categoryCode: category.code,
        sequence,
        attributeCodes,
      });

      const [variant] = await tx
        .insert(productVariants)
        .values({
          productId: product.id,
          sku,
          qrCodeValue: buildQrPayload(sku),
        })
        .returning();
      if (!variant) throw new Error("Variant insert returned no row");

      await tx.insert(variantAttributeValues).values(
        variantInput.attributeValueIds.map((attributeValueId) => ({
          variantId: variant.id,
          attributeValueId,
        })),
      );

      let price: number | null = null;
      let currency: string | null = null;
      if (variantInput.price !== undefined) {
        const [priceRow] = await tx
          .insert(variantPrices)
          .values({
            variantId: variant.id,
            price: variantInput.price.toFixed(2),
            currency: variantInput.currency ?? "EGP",
            createdBy: actorUserId,
          })
          .returning();
        price = priceRow ? Number(priceRow.price) : null;
        currency = priceRow?.currency ?? null;
      }

      createdVariants.push({
        id: variant.id,
        sku: variant.sku,
        qrCodeValue: variant.qrCodeValue,
        attributeValueIds: variantInput.attributeValueIds,
        price,
        currency,
      });
    }

    return {
      id: product.id,
      brandId: product.brandId,
      categoryId: product.categoryId,
      name: product.name,
      description: product.description,
      variants: createdVariants,
    };
  });
}

export interface ProductListVariant {
  id: string;
  sku: string;
  qrCodeValue: string;
  status: string;
  attributes: { attributeName: string; value: string }[];
  price: number | null;
  currency: string | null;
}

export interface ProductListItem {
  id: string;
  name: string;
  description: string | null;
  status: string;
  brand: { id: string; name: string; code: string };
  category: { id: string; name: string; code: string };
  variants: ProductListVariant[];
}

/**
 * Lists products (optionally scoped to one brand) with their variants,
 * attribute values, and current active price inlined — built for the
 * frontend's Products page, which needs all of that in one request rather
 * than N+1 round trips per product.
 */
export async function listProductsWithVariants(filters: { brandId?: string }): Promise<ProductListItem[]> {
  const productRows = await db
    .select({
      id: products.id,
      name: products.name,
      description: products.description,
      status: products.status,
      brandId: brands.id,
      brandName: brands.name,
      brandCode: brands.code,
      categoryId: categories.id,
      categoryName: categories.name,
      categoryCode: categories.code,
    })
    .from(products)
    .innerJoin(brands, eq(brands.id, products.brandId))
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(filters.brandId ? eq(products.brandId, filters.brandId) : undefined)
    .orderBy(products.name);

  if (productRows.length === 0) return [];

  const productIds = productRows.map((p) => p.id);

  const variantRows = await db
    .select({
      id: productVariants.id,
      productId: productVariants.productId,
      sku: productVariants.sku,
      qrCodeValue: productVariants.qrCodeValue,
      status: productVariants.status,
    })
    .from(productVariants)
    .where(inArray(productVariants.productId, productIds));

  const variantIds = variantRows.map((v) => v.id);

  const [attributeRows, priceRows] = variantIds.length
    ? await Promise.all([
        db
          .select({
            variantId: variantAttributeValues.variantId,
            attributeName: attributes.name,
            value: attributeValues.value,
          })
          .from(variantAttributeValues)
          .innerJoin(attributeValues, eq(attributeValues.id, variantAttributeValues.attributeValueId))
          .innerJoin(attributes, eq(attributes.id, attributeValues.attributeId))
          .where(inArray(variantAttributeValues.variantId, variantIds)),
        db
          .select({
            variantId: variantPrices.variantId,
            price: variantPrices.price,
            currency: variantPrices.currency,
          })
          .from(variantPrices)
          .where(and(inArray(variantPrices.variantId, variantIds), isNull(variantPrices.effectiveTo))),
      ])
    : [[], []];

  const attributesByVariant = new Map<string, { attributeName: string; value: string }[]>();
  for (const row of attributeRows) {
    const list = attributesByVariant.get(row.variantId) ?? [];
    list.push({ attributeName: row.attributeName, value: row.value });
    attributesByVariant.set(row.variantId, list);
  }

  const priceByVariant = new Map(priceRows.map((row) => [row.variantId, row]));

  const variantsByProduct = new Map<string, ProductListVariant[]>();
  for (const variant of variantRows) {
    const price = priceByVariant.get(variant.id);
    const list = variantsByProduct.get(variant.productId) ?? [];
    list.push({
      id: variant.id,
      sku: variant.sku,
      qrCodeValue: variant.qrCodeValue,
      status: variant.status,
      attributes: (attributesByVariant.get(variant.id) ?? []).sort((a, b) =>
        a.attributeName.localeCompare(b.attributeName),
      ),
      price: price ? Number(price.price) : null,
      currency: price?.currency ?? null,
    });
    variantsByProduct.set(variant.productId, list);
  }

  return productRows.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    status: p.status,
    brand: { id: p.brandId, name: p.brandName, code: p.brandCode },
    category: { id: p.categoryId, name: p.categoryName, code: p.categoryCode },
    variants: variantsByProduct.get(p.id) ?? [],
  }));
}
