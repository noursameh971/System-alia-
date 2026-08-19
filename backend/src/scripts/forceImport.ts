/**
 * One-shot corrective import: reads the "دليل المنتجات" (product directory)
 * sheet of المخزون.xlsx and inserts every real product row into the Alia
 * Hijab brand's catalog, replacing the placeholder "debug-check" row left
 * behind by an earlier bad run.
 *
 * Of the 999 rows in the sheet, only the rows that actually carry a product
 * name are real catalog entries — the sheet reserves the remaining barcode
 * slots (rows with a باركود but no المنتج/اللون/المقاس/سعر) for products
 * that haven't been entered yet. Those are skipped rather than inserted as
 * fabricated rows; the script prints exactly how many were skipped and why.
 *
 * Each Excel row is one (product, color, size) combination, so rows sharing
 * a product name are grouped into a single `products` row with one
 * `product_variants` row per color/size combination, matching the existing
 * attributes-based catalog schema (catalog.ts) instead of flattening
 * color/size into the product name.
 */
import xlsx from "xlsx";
import fs from "node:fs/promises";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { db, pool } from "../db/client.js";
import {
  attributeValues,
  attributes,
  brands,
  categories,
  products,
  productVariants,
  users,
  variantAttributeValues,
  variantPrices,
} from "../db/schema/index.js";

const SHEET_NAME = "دليل المنتجات";
const BRAND_NAME = "Alia Hijab";
const CATEGORY_NAME = "General";
const ADMIN_EMAIL = "admin@alia.com";

interface RawRow {
  المنتج?: unknown;
  اللون?: unknown;
  المقاس?: unknown;
  نشط?: unknown;
  "سعر القطعة"?: unknown;
  باركود?: unknown;
}

interface ProductRow {
  name: string;
  color: string;
  size: string;
  active: boolean;
  price: number | null;
  barcode: string;
}

function cell(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function readArg(flag: string): string | undefined {
  const prefix = `--${flag}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

/** Short, non-null code for an attribute_values row — only unique per (attributeId, value), so collisions across values are harmless. */
function attributeCode(value: string): string {
  const code = value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
  return code || "VAL";
}

/** Parses the sheet into rows that carry real product data, reporting how many were skipped as reserved/blank slots. */
function parseWorkbook(filePath: string): { rows: ProductRow[]; totalSheetRows: number; skippedBlank: number } {
  const workbook = xlsx.readFile(filePath);
  const sheet = workbook.Sheets[SHEET_NAME];
  if (!sheet) {
    throw new Error(`Sheet "${SHEET_NAME}" not found. Available sheets: ${workbook.SheetNames.join(", ")}`);
  }

  const raw = xlsx.utils.sheet_to_json(sheet, { defval: "", raw: false }) as RawRow[];
  const rows: ProductRow[] = [];
  let skippedBlank = 0;

  for (const r of raw) {
    const name = cell(r["المنتج"]).replace(/\s+/g, " ");
    if (!name) {
      skippedBlank += 1;
      continue;
    }

    const priceText = cell(r["سعر القطعة"]).replace(/,/g, "");
    const price = priceText ? Number(priceText) : null;

    rows.push({
      name,
      color: cell(r["اللون"]),
      size: cell(r["المقاس"]).replace(/\s+/g, ""),
      active: cell(r["نشط"]).toUpperCase() === "TRUE",
      price: price != null && Number.isFinite(price) ? price : null,
      barcode: cell(r["باركود"]),
    });
  }

  return { rows, totalSheetRows: raw.length, skippedBlank };
}

async function main(): Promise<void> {
  const filePath = path.resolve(readArg("file") ?? process.env.ALIA_IMPORT_FILE ?? "المخزون.xlsx");
  await fs.access(filePath);

  const { rows, totalSheetRows, skippedBlank } = parseWorkbook(filePath);
  console.log(
    `Sheet "${SHEET_NAME}": ${totalSheetRows} total rows, ${rows.length} real product rows, ${skippedBlank} skipped (reserved barcode slots with no product/color/size/price data).`,
  );

  const [brand] = await db.select().from(brands).where(eq(brands.name, BRAND_NAME)).limit(1);
  if (!brand) throw new Error(`Brand "${BRAND_NAME}" not found — expected it to already exist.`);

  const [category] = await db.select().from(categories).where(eq(categories.name, CATEGORY_NAME)).limit(1);
  if (!category) throw new Error(`Category "${CATEGORY_NAME}" not found — expected it to already exist.`);

  const [adminUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, ADMIN_EMAIL)).limit(1);
  if (!adminUser) throw new Error(`User "${ADMIN_EMAIL}" not found — needed as the price record's createdBy.`);

  // Group rows by product name — every row sharing a name becomes one
  // variant (color + size) of the same product.
  const grouped = new Map<string, ProductRow[]>();
  for (const row of rows) {
    const list = grouped.get(row.name) ?? [];
    list.push(row);
    grouped.set(row.name, list);
  }
  console.log(`Grouped into ${grouped.size} unique products across ${rows.length} variants.`);

  const stats = {
    dummyRemoved: 0,
    productsCreated: 0,
    productsReused: 0,
    variantsCreated: 0,
    variantsSkippedExisting: 0,
    pricesInserted: 0,
  };

  await db.transaction(async (tx) => {
    // Remove the placeholder row left by the earlier bad run.
    const deletedDummy = await tx
      .delete(products)
      .where(and(eq(products.brandId, brand.id), eq(products.name, "debug-check")))
      .returning({ id: products.id });
    stats.dummyRemoved = deletedDummy.length;

    async function getOrCreateAttribute(name: string): Promise<string> {
      const [existing] = await tx.select({ id: attributes.id }).from(attributes).where(eq(attributes.name, name)).limit(1);
      if (existing) return existing.id;
      const [created] = await tx.insert(attributes).values({ name }).returning({ id: attributes.id });
      return created!.id;
    }

    const colorAttributeId = await getOrCreateAttribute("Color");
    const sizeAttributeId = await getOrCreateAttribute("Size");

    const attributeValueCache = new Map<string, string>(); // `${attributeId}:${lowercased value}` -> id

    async function getOrCreateAttributeValueId(attributeId: string, rawValue: string): Promise<string> {
      const value = rawValue || "N/A";
      const cacheKey = `${attributeId}:${value.toLowerCase()}`;
      const cached = attributeValueCache.get(cacheKey);
      if (cached) return cached;

      const [existing] = await tx
        .select({ id: attributeValues.id })
        .from(attributeValues)
        .where(and(eq(attributeValues.attributeId, attributeId), eq(attributeValues.value, value)))
        .limit(1);
      if (existing) {
        attributeValueCache.set(cacheKey, existing.id);
        return existing.id;
      }

      const [created] = await tx
        .insert(attributeValues)
        .values({ attributeId, value, code: attributeCode(value) })
        .returning({ id: attributeValues.id });
      attributeValueCache.set(cacheKey, created!.id);
      return created!.id;
    }

    for (const [productName, variantRows] of grouped) {
      const anyActive = variantRows.some((r) => r.active);

      const [existingProduct] = await tx
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.brandId, brand.id), eq(products.name, productName)))
        .limit(1);

      let productId: string;
      if (existingProduct) {
        productId = existingProduct.id;
        stats.productsReused += 1;
      } else {
        const [createdProduct] = await tx
          .insert(products)
          .values({
            brandId: brand.id,
            categoryId: category.id,
            name: productName,
            status: anyActive ? "active" : "discontinued",
          })
          .returning({ id: products.id });
        productId = createdProduct!.id;
        stats.productsCreated += 1;
      }

      for (const row of variantRows) {
        const [existingVariant] = await tx
          .select({ id: productVariants.id })
          .from(productVariants)
          .where(eq(productVariants.sku, row.barcode))
          .limit(1);
        if (existingVariant) {
          stats.variantsSkippedExisting += 1;
          continue;
        }

        const [variant] = await tx
          .insert(productVariants)
          .values({
            productId,
            sku: row.barcode,
            qrCodeValue: row.barcode,
            status: row.active ? "active" : "discontinued",
          })
          .returning({ id: productVariants.id });
        stats.variantsCreated += 1;

        const colorValueId = await getOrCreateAttributeValueId(colorAttributeId, row.color);
        const sizeValueId = await getOrCreateAttributeValueId(sizeAttributeId, row.size);

        await tx.insert(variantAttributeValues).values([
          { variantId: variant!.id, attributeValueId: colorValueId },
          { variantId: variant!.id, attributeValueId: sizeValueId },
        ]);

        if (row.price != null) {
          await tx.insert(variantPrices).values({
            variantId: variant!.id,
            price: row.price.toFixed(2),
            currency: "EGP",
            createdBy: adminUser.id,
          });
          stats.pricesInserted += 1;
        }
      }
    }
  });

  console.log("Import complete:", stats);
}

main()
  .catch((err) => {
    console.error("Import failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
