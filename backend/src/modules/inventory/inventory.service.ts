import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db/client.js";
import {
  attributeValues,
  attributes,
  brands,
  categories,
  inventory,
  productVariants,
  products,
  variantAttributeValues,
  warehouseBins,
  warehouseZones,
} from "../../db/schema/index.js";

export async function getInventoryForVariant(variantId: string) {
  return db
    .select({
      binId: inventory.binId,
      binCode: warehouseBins.code,
      zoneCode: warehouseZones.code,
      quantity: inventory.quantity,
      updatedAt: inventory.updatedAt,
    })
    .from(inventory)
    .innerJoin(warehouseBins, eq(warehouseBins.id, inventory.binId))
    .innerJoin(warehouseZones, eq(warehouseZones.id, warehouseBins.zoneId))
    .where(eq(inventory.variantId, variantId));
}

export interface InventoryListFilters {
  brandId?: string;
  categoryId?: string;
  zoneId?: string;
  binId?: string;
}

export interface InventoryListRow {
  variantId: string;
  sku: string;
  productName: string;
  imageUrl: string | null;
  brand: { id: string; name: string; code: string };
  category: { id: string; name: string };
  attributes: { attributeName: string; value: string }[];
  binId: string;
  binCode: string;
  zoneId: string;
  zoneCode: string;
  quantity: number;
  updatedAt: Date;
}

/**
 * Lists current on-hand stock across every variant/bin, optionally scoped by
 * brand, category, zone, or bin — the data source for the Inventory
 * dashboard's filterable stock-levels table.
 */
export async function listInventory(filters: InventoryListFilters): Promise<InventoryListRow[]> {
  const conditions = [
    filters.brandId ? eq(products.brandId, filters.brandId) : undefined,
    filters.categoryId ? eq(products.categoryId, filters.categoryId) : undefined,
    filters.zoneId ? eq(warehouseZones.id, filters.zoneId) : undefined,
    filters.binId ? eq(warehouseBins.id, filters.binId) : undefined,
  ].filter((c) => c !== undefined);

  const rows = await db
    .select({
      variantId: productVariants.id,
      sku: productVariants.sku,
      productName: products.name,
      imageUrl: products.imageUrl,
      brandId: brands.id,
      brandName: brands.name,
      brandCode: brands.code,
      categoryId: categories.id,
      categoryName: categories.name,
      binId: warehouseBins.id,
      binCode: warehouseBins.code,
      zoneId: warehouseZones.id,
      zoneCode: warehouseZones.code,
      quantity: inventory.quantity,
      updatedAt: inventory.updatedAt,
    })
    .from(inventory)
    .innerJoin(productVariants, eq(productVariants.id, inventory.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .innerJoin(brands, eq(brands.id, products.brandId))
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .innerJoin(warehouseBins, eq(warehouseBins.id, inventory.binId))
    .innerJoin(warehouseZones, eq(warehouseZones.id, warehouseBins.zoneId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(products.name, productVariants.sku);

  if (rows.length === 0) return [];

  const variantIds = [...new Set(rows.map((r) => r.variantId))];
  const attributeRows = await db
    .select({
      variantId: variantAttributeValues.variantId,
      attributeName: attributes.name,
      value: attributeValues.value,
    })
    .from(variantAttributeValues)
    .innerJoin(attributeValues, eq(attributeValues.id, variantAttributeValues.attributeValueId))
    .innerJoin(attributes, eq(attributes.id, attributeValues.attributeId))
    .where(inArray(variantAttributeValues.variantId, variantIds));

  const attributesByVariant = new Map<string, { attributeName: string; value: string }[]>();
  for (const row of attributeRows) {
    const list = attributesByVariant.get(row.variantId) ?? [];
    list.push({ attributeName: row.attributeName, value: row.value });
    attributesByVariant.set(row.variantId, list);
  }

  return rows.map((r) => ({
    variantId: r.variantId,
    sku: r.sku,
    productName: r.productName,
    imageUrl: r.imageUrl,
    brand: { id: r.brandId, name: r.brandName, code: r.brandCode },
    category: { id: r.categoryId, name: r.categoryName },
    attributes: (attributesByVariant.get(r.variantId) ?? []).sort((a, b) =>
      a.attributeName.localeCompare(b.attributeName),
    ),
    binId: r.binId,
    binCode: r.binCode,
    zoneId: r.zoneId,
    zoneCode: r.zoneCode,
    quantity: r.quantity,
    updatedAt: r.updatedAt,
  }));
}
