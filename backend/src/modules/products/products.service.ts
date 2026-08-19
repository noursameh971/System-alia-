import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { db } from "../../db/client.js";
import { decrementInventory, incrementInventory } from "../../db/inventoryOperations.js";
import {
  attributeValues,
  attributes,
  brands,
  categories,
  inventory,
  productVariants,
  products,
  stockMovements,
  variantAttributeValues,
  variantCosts,
  variantPrices,
  warehouseBins,
  warehouseZones,
  warehouses,
} from "../../db/schema/index.js";
import { ApiError } from "../../utils/apiError.js";
import { pgErrorCode, POSTGRES_FOREIGN_KEY_VIOLATION_CODES } from "../../utils/pgErrors.js";
import { attributeSignature, buildVariantSku } from "../../utils/skuGenerator.js";
import { buildQrPayload } from "../qrcode/qrcode.util.js";
import type {
  CreateProductInput,
  QuickCreateProductInput,
  UpdateProductVariantInput,
} from "./products.schema.js";

// PgTransaction's generic params aren't meaningfully constrainable here; see inventoryOperations.ts's identical alias.
export type Tx = PgTransaction<any, any, any>;

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
        imageUrl: input.imageUrl || null,
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
  /** Production/unit cost — null if never set (cost tracking is opt-in, unlike price). */
  cost: number | null;
  /** Sum of on-hand quantity across every bin this variant has inventory in. */
  stock: number;
}

export interface ProductListItem {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
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
      imageUrl: products.imageUrl,
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

  const [attributeRows, priceRows, costRows, inventoryRows] = variantIds.length
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
        db
          .select({
            variantId: variantCosts.variantId,
            cost: variantCosts.cost,
          })
          .from(variantCosts)
          .where(and(inArray(variantCosts.variantId, variantIds), isNull(variantCosts.effectiveTo))),
        db
          .select({ variantId: inventory.variantId, quantity: inventory.quantity })
          .from(inventory)
          .where(inArray(inventory.variantId, variantIds)),
      ])
    : [[], [], [], []];

  const attributesByVariant = new Map<string, { attributeName: string; value: string }[]>();
  for (const row of attributeRows) {
    const list = attributesByVariant.get(row.variantId) ?? [];
    list.push({ attributeName: row.attributeName, value: row.value });
    attributesByVariant.set(row.variantId, list);
  }

  const priceByVariant = new Map(priceRows.map((row) => [row.variantId, row]));
  const costByVariant = new Map(costRows.map((row) => [row.variantId, row]));

  const stockByVariant = new Map<string, number>();
  for (const row of inventoryRows) {
    stockByVariant.set(row.variantId, (stockByVariant.get(row.variantId) ?? 0) + row.quantity);
  }

  const variantsByProduct = new Map<string, ProductListVariant[]>();
  for (const variant of variantRows) {
    const price = priceByVariant.get(variant.id);
    const cost = costByVariant.get(variant.id);
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
      cost: cost ? Number(cost.cost) : null,
      stock: stockByVariant.get(variant.id) ?? 0,
    });
    variantsByProduct.set(variant.productId, list);
  }

  return productRows.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    imageUrl: p.imageUrl,
    status: p.status,
    brand: { id: p.brandId, name: p.brandName, code: p.brandCode },
    category: { id: p.categoryId, name: p.categoryName, code: p.categoryCode },
    variants: variantsByProduct.get(p.id) ?? [],
  }));
}

export interface VariantLookupResult {
  id: string;
  sku: string;
  qrCodeValue: string;
  status: string;
  productId: string;
  productName: string;
  imageUrl: string | null;
  brand: { id: string; name: string; code: string };
  category: { id: string; name: string };
  attributes: { attributeName: string; value: string }[];
  price: number | null;
  currency: string | null;
}

/**
 * Resolves a variant by its SKU (== the QR code payload) — backs the
 * frontend's "scan or type the QR/SKU" input on the stock movement forms,
 * so staff get the product name/attributes back to confirm before picking a
 * bin and quantity, instead of acting on a bare SKU string.
 */
export async function getVariantBySku(sku: string): Promise<VariantLookupResult | null> {
  const [row] = await db
    .select({
      id: productVariants.id,
      sku: productVariants.sku,
      qrCodeValue: productVariants.qrCodeValue,
      status: productVariants.status,
      productId: products.id,
      productName: products.name,
      imageUrl: products.imageUrl,
      brandId: brands.id,
      brandName: brands.name,
      brandCode: brands.code,
      categoryId: categories.id,
      categoryName: categories.name,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .innerJoin(brands, eq(brands.id, products.brandId))
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(eq(productVariants.sku, sku))
    .limit(1);

  if (!row) return null;

  const attributeRows = await db
    .select({ attributeName: attributes.name, value: attributeValues.value })
    .from(variantAttributeValues)
    .innerJoin(attributeValues, eq(attributeValues.id, variantAttributeValues.attributeValueId))
    .innerJoin(attributes, eq(attributes.id, attributeValues.attributeId))
    .where(eq(variantAttributeValues.variantId, row.id));

  const [priceRow] = await db
    .select({ price: variantPrices.price, currency: variantPrices.currency })
    .from(variantPrices)
    .where(and(eq(variantPrices.variantId, row.id), isNull(variantPrices.effectiveTo)))
    .limit(1);

  return {
    id: row.id,
    sku: row.sku,
    qrCodeValue: row.qrCodeValue,
    status: row.status,
    productId: row.productId,
    productName: row.productName,
    imageUrl: row.imageUrl,
    brand: { id: row.brandId, name: row.brandName, code: row.brandCode },
    category: { id: row.categoryId, name: row.categoryName },
    attributes: attributeRows.sort((a, b) => a.attributeName.localeCompare(b.attributeName)),
    price: priceRow ? Number(priceRow.price) : null,
    currency: priceRow?.currency ?? null,
  };
}

export const DEFAULT_CATEGORY_NAME = "General";
const DEFAULT_WAREHOUSE_NAME = "Main Warehouse";
const DEFAULT_ZONE_CODE = "MAIN";
const DEFAULT_BIN_CODE = "BIN-01";

export async function getOrCreateAttributeTx(tx: Tx, name: string): Promise<string> {
  const [existing] = await tx.select({ id: attributes.id }).from(attributes).where(eq(attributes.name, name)).limit(1);
  if (existing) return existing.id;
  const [created] = await tx.insert(attributes).values({ name }).returning({ id: attributes.id });
  return created!.id;
}

/** Short, non-null code for an attribute_values row — only unique per (attributeId, value), so collisions across values are harmless. */
function attributeCode(value: string): string {
  const code = value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
  return code || "VAL";
}

export async function getOrCreateAttributeValueTx(
  tx: Tx,
  attributeId: string,
  rawValue: string,
): Promise<{ id: string; code: string }> {
  const value = rawValue.trim();
  const [existing] = await tx
    .select({ id: attributeValues.id, code: attributeValues.code })
    .from(attributeValues)
    .where(and(eq(attributeValues.attributeId, attributeId), eq(attributeValues.value, value)))
    .limit(1);
  if (existing) return existing;

  const [created] = await tx
    .insert(attributeValues)
    .values({ attributeId, value, code: attributeCode(value) })
    .returning({ id: attributeValues.id, code: attributeValues.code });
  return created!;
}

/** Base code candidate for a new category row — unlike attribute_values.code, categories.code is globally unique, so this is only a starting point for getOrCreateCategoryTx's collision loop below. */
function baseCategoryCode(name: string): string {
  const code = name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  return code || "CAT";
}

/**
 * Get-or-create a category by name — backs the free-text Category field on
 * both the quick-add form and the Product Profile drawer's category
 * selector, same pattern as color/size attribute values. categories.code is
 * globally unique (unlike attribute_values.code, which only needs to be
 * unique per attribute), so a name collision on the derived code falls back
 * to appending a numeric suffix until it finds a free one.
 */
export async function getOrCreateCategoryTx(tx: Tx, rawName: string): Promise<{ id: string; name: string }> {
  const name = rawName.trim();
  const [existing] = await tx
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(eq(categories.name, name))
    .limit(1);
  if (existing) return existing;

  const base = baseCategoryCode(name);
  let code = base;
  for (let suffix = 2; ; suffix += 1) {
    const [taken] = await tx.select({ id: categories.id }).from(categories).where(eq(categories.code, code)).limit(1);
    if (!taken) break;
    const suffixStr = String(suffix);
    code = `${base.slice(0, 10 - suffixStr.length)}${suffixStr}`;
  }

  const [created] = await tx
    .insert(categories)
    .values({ name, code })
    .returning({ id: categories.id, name: categories.name });
  return created!;
}

/**
 * Resolves the single default (warehouse, zone, bin) that "Initial Stock" on
 * the quick-add form lands in — the form only asks for a quantity, not a
 * bin, so there has to be one obvious place for it to go. Warehouses aren't
 * brand-scoped in the schema, so this is shared across every brand rather
 * than created per-brand.
 */
async function getOrCreateDefaultBinTx(tx: Tx): Promise<string> {
  let [warehouse] = await tx
    .select({ id: warehouses.id })
    .from(warehouses)
    .where(eq(warehouses.name, DEFAULT_WAREHOUSE_NAME))
    .limit(1);
  if (!warehouse) {
    [warehouse] = await tx.insert(warehouses).values({ name: DEFAULT_WAREHOUSE_NAME }).returning({ id: warehouses.id });
  }

  let [zone] = await tx
    .select({ id: warehouseZones.id })
    .from(warehouseZones)
    .where(and(eq(warehouseZones.warehouseId, warehouse!.id), eq(warehouseZones.code, DEFAULT_ZONE_CODE)))
    .limit(1);
  if (!zone) {
    [zone] = await tx
      .insert(warehouseZones)
      .values({ warehouseId: warehouse!.id, code: DEFAULT_ZONE_CODE, name: "Main" })
      .returning({ id: warehouseZones.id });
  }

  let [bin] = await tx
    .select({ id: warehouseBins.id })
    .from(warehouseBins)
    .where(and(eq(warehouseBins.zoneId, zone!.id), eq(warehouseBins.code, DEFAULT_BIN_CODE)))
    .limit(1);
  if (!bin) {
    [bin] = await tx.insert(warehouseBins).values({ zoneId: zone!.id, code: DEFAULT_BIN_CODE }).returning({ id: warehouseBins.id });
  }

  return bin!.id;
}

export interface QuickProductResult {
  productId: string;
  variants: { variantId: string; sku: string }[];
}

/**
 * Backs the Products page's "+ Add Product" modal: one product with one or
 * more (color, size) variants, each with its own price and optional initial
 * stock (recorded as an inbound movement) — all in one transaction.
 *
 * The product is get-or-created by (brandId, name) rather than always
 * inserted: submitting a name that already exists in this brand adds the
 * new variants to that product instead of hitting the
 * products_brand_id_name_key unique constraint, which is what lets a second
 * "+ Add Product" call add another size/color to something created earlier.
 */
export async function createQuickProduct(
  input: QuickCreateProductInput,
  actorUserId: string,
): Promise<QuickProductResult> {
  return db.transaction(async (tx) => {
    const [brand] = await tx.select().from(brands).where(eq(brands.id, input.brandId)).limit(1);
    if (!brand) throw ApiError.badRequest(`Brand ${input.brandId} does not exist`);

    const colorAttributeId = await getOrCreateAttributeTx(tx, "Color");
    const sizeAttributeId = await getOrCreateAttributeTx(tx, "Size");

    const [existingProduct] = await tx
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.brandId, brand.id), eq(products.name, input.name)))
      .limit(1);

    // Category only applies when this call actually creates the product —
    // adding another variant to an existing product (existingProduct set)
    // leaves its category alone even if a different one was typed here, same
    // as how the name field is ignored once it's just a lookup key.
    let productId: string;
    if (existingProduct) {
      productId = existingProduct.id;
    } else {
      const category = await getOrCreateCategoryTx(tx, input.category?.trim() || DEFAULT_CATEGORY_NAME);
      const [created] = await tx
        .insert(products)
        .values({
          brandId: brand.id,
          categoryId: category.id,
          name: input.name,
          status: "active",
          imageUrl: input.imageUrl?.trim() || null,
        })
        .returning({ id: products.id });
      productId = created!.id;
    }

    // Looked up by productId (rather than reused from the branch above) so
    // it's correct either way: the category just created for a brand-new
    // product, or the existing product's own category when adding variants
    // to something created earlier.
    const [productCategory] = await tx
      .select({ code: categories.code })
      .from(products)
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .where(eq(products.id, productId))
      .limit(1);
    if (!productCategory) throw new Error(`Product ${productId} has no resolvable category`); // unreachable

    // One sequence value for the whole batch — every variant created in this
    // call shares it, differentiated by the attribute codes in the SKU
    // (same pattern as createProductWithVariants).
    const seqResult = await tx.execute<{ seq: string }>(sql`select nextval('product_sku_seq') as seq`);
    const sequence = Number(seqResult.rows[0]?.seq);

    const createdVariants: { variantId: string; sku: string }[] = [];
    const defaultBinId = input.variants.some((v) => v.initialStock > 0) ? await getOrCreateDefaultBinTx(tx) : null;

    for (const variantInput of input.variants) {
      const colorValue = await getOrCreateAttributeValueTx(tx, colorAttributeId, variantInput.color);
      const sizeValue = await getOrCreateAttributeValueTx(tx, sizeAttributeId, variantInput.size);

      // "Color" < "Size" alphabetically, matching createProductWithVariants' sort-by-attribute-name.
      const sku = buildVariantSku({
        brandCode: brand.code,
        categoryCode: productCategory.code,
        sequence,
        attributeCodes: [colorValue.code, sizeValue.code],
      });

      const [variant] = await tx
        .insert(productVariants)
        .values({ productId, sku, qrCodeValue: buildQrPayload(sku), status: "active" })
        .returning({ id: productVariants.id });
      if (!variant) throw new Error("Variant insert returned no row"); // unreachable

      await tx.insert(variantAttributeValues).values([
        { variantId: variant.id, attributeValueId: colorValue.id },
        { variantId: variant.id, attributeValueId: sizeValue.id },
      ]);

      await tx.insert(variantPrices).values({
        variantId: variant.id,
        price: variantInput.price.toFixed(2),
        currency: "EGP",
        createdBy: actorUserId,
      });

      if (variantInput.cost !== undefined) {
        await tx.insert(variantCosts).values({
          variantId: variant.id,
          cost: variantInput.cost.toFixed(2),
          currency: "EGP",
          createdBy: actorUserId,
        });
      }

      if (variantInput.initialStock > 0 && defaultBinId) {
        await incrementInventory(tx, { variantId: variant.id, binId: defaultBinId, quantity: variantInput.initialStock });
        await tx.insert(stockMovements).values({
          variantId: variant.id,
          movementType: "inbound",
          quantity: variantInput.initialStock,
          toBinId: defaultBinId,
          performedBy: actorUserId,
          notes: "Initial stock on product creation",
        });
      }

      createdVariants.push({ variantId: variant.id, sku });
    }

    return { productId, variants: createdVariants };
  });
}

/**
 * Closes out the active `variant_prices` row (effective_to = now()) for
 * every variant of `productId` and inserts a fresh one at `price` for each —
 * price is a product-level concept in the UI (one "Price" per catalog
 * entry), even though it's stored per-variant to preserve history, so any
 * price edit (whether started from a single variant row or the drawer's
 * product-level field) fans out to every sibling variant instead of letting
 * variants of the same product drift to different prices.
 */
async function setProductPriceTx(tx: Tx, productId: string, price: number, actorUserId: string): Promise<number> {
  const variantIds = (
    await tx.select({ id: productVariants.id }).from(productVariants).where(eq(productVariants.productId, productId))
  ).map((v) => v.id);
  if (variantIds.length === 0) return 0;

  await tx
    .update(variantPrices)
    .set({ effectiveTo: sql`now()` })
    .where(and(inArray(variantPrices.variantId, variantIds), isNull(variantPrices.effectiveTo)));

  await tx.insert(variantPrices).values(
    variantIds.map((variantId) => ({
      variantId,
      price: price.toFixed(2),
      currency: "EGP",
      createdBy: actorUserId,
    })),
  );

  return variantIds.length;
}

/**
 * Same fan-out shape as setProductPriceTx above, for production cost:
 * closes out the active `variant_costs` row for every variant of
 * `productId` and inserts a fresh one — cost is treated as a product-level
 * concept in the UI (same as price), even though it's stored per-variant to
 * preserve history.
 */
async function setProductCostTx(tx: Tx, productId: string, cost: number, actorUserId: string): Promise<number> {
  const variantIds = (
    await tx.select({ id: productVariants.id }).from(productVariants).where(eq(productVariants.productId, productId))
  ).map((v) => v.id);
  if (variantIds.length === 0) return 0;

  await tx
    .update(variantCosts)
    .set({ effectiveTo: sql`now()` })
    .where(and(inArray(variantCosts.variantId, variantIds), isNull(variantCosts.effectiveTo)));

  await tx.insert(variantCosts).values(
    variantIds.map((variantId) => ({
      variantId,
      cost: cost.toFixed(2),
      currency: "EGP",
      createdBy: actorUserId,
    })),
  );

  return variantIds.length;
}

export interface UpdatedVariantResult {
  productId: string;
  variantId: string;
}

/**
 * Applies whichever fields are present on `input`. Renaming touches the
 * shared `products` row, so it renames every sibling variant of the same
 * product, not just this one — that's intentional (the name is a
 * product-level field), not a bug specific to the quick-add flow.
 *
 * Changing price fans out to every variant of the product via
 * setProductPriceTx (see its doc comment) rather than just this one.
 */
export async function updateProductVariant(
  variantId: string,
  input: UpdateProductVariantInput,
  actorUserId: string,
): Promise<UpdatedVariantResult> {
  return db.transaction(async (tx) => {
    const [variant] = await tx
      .select({ id: productVariants.id, productId: productVariants.productId })
      .from(productVariants)
      .where(eq(productVariants.id, variantId))
      .limit(1);
    if (!variant) throw ApiError.notFound(`Variant ${variantId} does not exist`);

    if (input.name !== undefined) {
      await tx.update(products).set({ name: input.name, updatedAt: sql`now()` }).where(eq(products.id, variant.productId));
    }

    // Empty string explicitly clears the image (-> null); omitting the
    // field entirely (undefined) leaves it untouched — same distinction
    // updateProductCategory's caller relies on elsewhere in this file.
    if (input.imageUrl !== undefined) {
      await tx
        .update(products)
        .set({ imageUrl: input.imageUrl.trim() || null, updatedAt: sql`now()` })
        .where(eq(products.id, variant.productId));
    }

    if (input.status !== undefined) {
      await tx
        .update(productVariants)
        .set({ status: input.status, updatedAt: sql`now()` })
        .where(eq(productVariants.id, variantId));
    }

    const attributeEdits: Array<["Color" | "Size", string | undefined]> = [
      ["Color", input.color],
      ["Size", input.size],
    ];
    for (const [attributeName, newRawValue] of attributeEdits) {
      if (newRawValue === undefined) continue;

      const attributeId = await getOrCreateAttributeTx(tx, attributeName);
      const newValue = await getOrCreateAttributeValueTx(tx, attributeId, newRawValue);

      const existingLinks = await tx
        .select({ attributeValueId: variantAttributeValues.attributeValueId })
        .from(variantAttributeValues)
        .innerJoin(attributeValues, eq(attributeValues.id, variantAttributeValues.attributeValueId))
        .where(and(eq(variantAttributeValues.variantId, variantId), eq(attributeValues.attributeId, attributeId)));

      const alreadyLinked = existingLinks.some((link) => link.attributeValueId === newValue.id);
      for (const link of existingLinks) {
        if (link.attributeValueId !== newValue.id) {
          await tx
            .delete(variantAttributeValues)
            .where(
              and(
                eq(variantAttributeValues.variantId, variantId),
                eq(variantAttributeValues.attributeValueId, link.attributeValueId),
              ),
            );
        }
      }
      if (!alreadyLinked) {
        await tx.insert(variantAttributeValues).values({ variantId, attributeValueId: newValue.id });
      }
    }

    if (input.price !== undefined) {
      await setProductPriceTx(tx, variant.productId, input.price, actorUserId);
    }

    if (input.cost !== undefined) {
      await setProductCostTx(tx, variant.productId, input.cost, actorUserId);
    }

    return { productId: variant.productId, variantId };
  });
}

export interface UpdateProductPriceResult {
  productId: string;
  price: number;
  variantCount: number;
}

/** Backs the Product Profile drawer's "Update Product Price" field — sets one price across every variant of the product. */
export async function updateProductPrice(
  productId: string,
  price: number,
  actorUserId: string,
): Promise<UpdateProductPriceResult> {
  return db.transaction(async (tx) => {
    const [product] = await tx.select({ id: products.id }).from(products).where(eq(products.id, productId)).limit(1);
    if (!product) throw ApiError.notFound(`Product ${productId} does not exist`);

    const variantCount = await setProductPriceTx(tx, productId, price, actorUserId);
    return { productId, price, variantCount };
  });
}

export interface UpdateProductCostResult {
  productId: string;
  cost: number;
  variantCount: number;
}

/** Backs the Product Profile drawer's "Update Production Cost" field — sets one cost across every variant of the product. */
export async function updateProductCost(
  productId: string,
  cost: number,
  actorUserId: string,
): Promise<UpdateProductCostResult> {
  return db.transaction(async (tx) => {
    const [product] = await tx.select({ id: products.id }).from(products).where(eq(products.id, productId)).limit(1);
    if (!product) throw ApiError.notFound(`Product ${productId} does not exist`);

    const variantCount = await setProductCostTx(tx, productId, cost, actorUserId);
    return { productId, cost, variantCount };
  });
}

export interface UpdateProductCategoryResult {
  productId: string;
  categoryId: string;
  categoryName: string;
}

/**
 * Backs the Product Profile drawer's Category selector. Category is a
 * single column on the `products` row (not per-variant), so every variant
 * of the product picks it up automatically — there's no fan-out step like
 * setProductPriceTx, just one update.
 */
export async function updateProductCategory(productId: string, categoryName: string): Promise<UpdateProductCategoryResult> {
  return db.transaction(async (tx) => {
    const [product] = await tx.select({ id: products.id }).from(products).where(eq(products.id, productId)).limit(1);
    if (!product) throw ApiError.notFound(`Product ${productId} does not exist`);

    const category = await getOrCreateCategoryTx(tx, categoryName);
    await tx.update(products).set({ categoryId: category.id, updatedAt: sql`now()` }).where(eq(products.id, productId));

    return { productId, categoryId: category.id, categoryName: category.name };
  });
}

export interface BulkUpdateCategoryResult {
  categoryId: string;
  categoryName: string;
  updatedCount: number;
}

/** Backs the products table's bulk-select "Set Category" action — one get-or-created category applied to every selected product in one statement. */
export async function bulkSetProductsCategory(productIds: string[], categoryName: string): Promise<BulkUpdateCategoryResult> {
  return db.transaction(async (tx) => {
    const category = await getOrCreateCategoryTx(tx, categoryName);
    const updated = await tx
      .update(products)
      .set({ categoryId: category.id, updatedAt: sql`now()` })
      .where(inArray(products.id, productIds))
      .returning({ id: products.id });

    return { categoryId: category.id, categoryName: category.name, updatedCount: updated.length };
  });
}

export interface DeleteVariantResult {
  /** True if the variant row was actually removed; false if it had order/movement history and was archived (status set to "discontinued") instead. */
  deleted: boolean;
}

/**
 * Tries a hard delete first (clean for a variant with no sales or stock
 * history yet — e.g. one just created by mistake). stock_movements and
 * order_items both reference variant_id ON DELETE RESTRICT on purpose, so
 * that Postgres constraint is what actually decides whether history exists;
 * catching its violation here and archiving instead keeps that history
 * intact rather than working around the restrict with a cascade.
 */
export async function deleteProductVariant(variantId: string): Promise<DeleteVariantResult> {
  const [variant] = await db
    .select({ id: productVariants.id, productId: productVariants.productId })
    .from(productVariants)
    .where(eq(productVariants.id, variantId))
    .limit(1);
  if (!variant) throw ApiError.notFound(`Variant ${variantId} does not exist`);

  try {
    await db.transaction(async (tx) => {
      await tx.delete(productVariants).where(eq(productVariants.id, variantId));

      const remaining = await tx
        .select({ id: productVariants.id })
        .from(productVariants)
        .where(eq(productVariants.productId, variant.productId))
        .limit(1);
      if (remaining.length === 0) {
        await tx.delete(products).where(eq(products.id, variant.productId));
      }
    });
    return { deleted: true };
  } catch (err) {
    const code = pgErrorCode(err);
    if (!code || !POSTGRES_FOREIGN_KEY_VIOLATION_CODES.includes(code as (typeof POSTGRES_FOREIGN_KEY_VIOLATION_CODES)[number])) {
      throw err;
    }

    await db
      .update(productVariants)
      .set({ status: "discontinued", updatedAt: sql`now()` })
      .where(eq(productVariants.id, variantId));
    return { deleted: false };
  }
}

export interface SetVariantStockResult {
  variantId: string;
  stock: number;
}

/**
 * Backs the Product Profile drawer's inline stock editor: takes the *target*
 * total (not a delta) and reconciles it against the variant's current
 * on-hand quantity summed across every bin. The actual inventory write
 * always lands in the shared default bin (see getOrCreateDefaultBinTx) —
 * this is a quick-edit convenience, not a bin-aware transfer tool, so if a
 * variant already has stock split across other bins (e.g. from the full
 * Inventory movement forms) and the default bin doesn't have enough to
 * absorb a large decrease, this throws a 409 telling the caller to use the
 * Inventory page instead of silently going negative in some other bin.
 */
export async function setVariantStock(
  variantId: string,
  targetQuantity: number,
  actorUserId: string,
): Promise<SetVariantStockResult> {
  return db.transaction(async (tx) => {
    const [variant] = await tx
      .select({ id: productVariants.id })
      .from(productVariants)
      .where(eq(productVariants.id, variantId))
      .limit(1);
    if (!variant) throw ApiError.notFound(`Variant ${variantId} does not exist`);

    const rows = await tx.select({ quantity: inventory.quantity }).from(inventory).where(eq(inventory.variantId, variantId));
    const currentTotal = rows.reduce((sum, row) => sum + row.quantity, 0);
    const delta = targetQuantity - currentTotal;

    if (delta === 0) return { variantId, stock: currentTotal };

    const binId = await getOrCreateDefaultBinTx(tx);

    if (delta > 0) {
      await incrementInventory(tx, { variantId, binId, quantity: delta });
      await tx.insert(stockMovements).values({
        variantId,
        movementType: "adjustment",
        quantity: delta,
        toBinId: binId,
        performedBy: actorUserId,
        notes: "Quick stock adjustment (Product Profile)",
      });
    } else {
      await decrementInventory(tx, { variantId, binId, quantity: -delta });
      await tx.insert(stockMovements).values({
        variantId,
        movementType: "adjustment",
        quantity: -delta,
        fromBinId: binId,
        performedBy: actorUserId,
        notes: "Quick stock adjustment (Product Profile)",
      });
    }

    return { variantId, stock: targetQuantity };
  });
}
