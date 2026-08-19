/**
 * Excel export/import for the Products page. Kept in its own file (rather
 * than folded into products.service.ts, which was already large) but reuses
 * that file's get-or-create helpers and its existing mutation entry points
 * (updateProductVariant, setVariantStock) so import goes through the exact
 * same audited price-sync / stock-reconciliation paths a manual edit would
 * — nothing here bypasses those rules to write faster.
 */
import xlsx from "xlsx";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import {
  brands,
  categories,
  productVariants,
  products,
  variantAttributeValues,
  variantPrices,
} from "../../db/schema/index.js";
import { ApiError } from "../../utils/apiError.js";
import { buildVariantSku } from "../../utils/skuGenerator.js";
import { buildQrPayload } from "../qrcode/qrcode.util.js";
import {
  DEFAULT_CATEGORY_NAME,
  getOrCreateAttributeTx,
  getOrCreateAttributeValueTx,
  getOrCreateCategoryTx,
  listProductsWithVariants,
  setVariantStock,
  updateProductVariant,
  type Tx,
} from "./products.service.js";

const EXPORT_HEADERS = [
  "Product Name",
  "Category",
  "Color",
  "Size",
  "SKU",
  "Price",
  "Currency",
  "Stock",
  "Status",
] as const;

/** One row per variant — matches the shape importProductRows expects, so a round-tripped export can be re-imported unchanged. */
export async function exportProductsWorkbook(brandId?: string): Promise<Buffer> {
  const items = await listProductsWithVariants({ brandId });

  const rows = items.flatMap((product) => {
    if (product.variants.length === 0) {
      return [
        {
          "Product Name": product.name,
          Category: product.category.name,
          Color: "",
          Size: "",
          SKU: "",
          Price: "",
          Currency: "",
          Stock: "",
          Status: product.status,
        },
      ];
    }
    return product.variants.map((variant) => ({
      "Product Name": product.name,
      Category: product.category.name,
      Color: variant.attributes.find((a) => a.attributeName.toLowerCase() === "color")?.value ?? "",
      Size: variant.attributes.find((a) => a.attributeName.toLowerCase() === "size")?.value ?? "",
      SKU: variant.sku,
      Price: variant.price != null ? String(variant.price) : "",
      Currency: variant.currency ?? "",
      Stock: String(variant.stock),
      Status: variant.status,
    }));
  });

  const worksheet = xlsx.utils.json_to_sheet(rows, { header: [...EXPORT_HEADERS] });
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, "Products");
  return xlsx.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

interface ParsedImportRow {
  productName: string;
  category: string;
  color: string;
  size: string;
  sku: string;
  priceRaw: string;
  stockRaw: string;
  statusRaw: string;
}

function cell(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

/** Reads the first sheet of an uploaded .xlsx into rows keyed by the same headers exportProductsWorkbook writes. */
function parseImportWorkbook(buffer: Buffer): ParsedImportRow[] {
  let workbook: ReturnType<typeof xlsx.read>;
  try {
    workbook = xlsx.read(buffer, { type: "buffer" });
  } catch {
    throw ApiError.badRequest("Couldn't read that file — is it a valid .xlsx workbook?");
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw ApiError.badRequest("The workbook has no sheets");
  const sheet = workbook.Sheets[sheetName]!;
  const raw = xlsx.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  return raw.map((r) => ({
    productName: cell(r["Product Name"]),
    category: cell(r["Category"]),
    color: cell(r["Color"]),
    size: cell(r["Size"]),
    sku: cell(r["SKU"]),
    priceRaw: cell(r["Price"]),
    stockRaw: cell(r["Stock"]),
    statusRaw: cell(r["Status"]).toLowerCase(),
  }));
}

export interface ImportRowError {
  row: number;
  message: string;
}

export interface ImportProductsResult {
  totalRows: number;
  created: number;
  updated: number;
  skipped: number;
  errors: ImportRowError[];
}

function parsePrice(raw: string): number | undefined {
  if (!raw) return undefined;
  const value = Number(raw);
  if (Number.isNaN(value) || value <= 0) throw new Error(`Invalid price "${raw}"`);
  return value;
}

function parseStock(raw: string): number | undefined {
  if (!raw) return undefined;
  const value = Number(raw);
  if (Number.isNaN(value) || value < 0 || !Number.isInteger(value)) throw new Error(`Invalid stock "${raw}"`);
  return value;
}

function parseStatus(raw: string): "active" | "discontinued" | undefined {
  if (!raw) return undefined;
  if (raw === "active" || raw === "discontinued") return raw;
  throw new Error(`Invalid status "${raw}" — expected "active" or "discontinued"`);
}

/**
 * Updates an already-resolved variant: price goes through
 * updateProductVariant (which fans the new price out to every sibling
 * variant of the product, same as a manual edit), stock through
 * setVariantStock (target-quantity reconciliation), status as a plain
 * per-variant field.
 */
async function applyRowToVariant(
  variantId: string,
  row: { price?: number; stock?: number; status?: "active" | "discontinued" },
  actorUserId: string,
): Promise<void> {
  if (row.price !== undefined) await updateProductVariant(variantId, { price: row.price }, actorUserId);
  if (row.status !== undefined) await updateProductVariant(variantId, { status: row.status }, actorUserId);
  if (row.stock !== undefined) await setVariantStock(variantId, row.stock, actorUserId);
}

/** Finds an existing variant of `productId` whose attribute set is exactly {color, size}, or null if none matches. */
async function findVariantByAttributesTx(
  tx: Tx,
  productId: string,
  colorValueId: string,
  sizeValueId: string,
): Promise<string | null> {
  const rows = await tx
    .select({ variantId: variantAttributeValues.variantId })
    .from(variantAttributeValues)
    .innerJoin(productVariants, eq(productVariants.id, variantAttributeValues.variantId))
    .where(
      and(
        eq(productVariants.productId, productId),
        inArray(variantAttributeValues.attributeValueId, [colorValueId, sizeValueId]),
      ),
    );

  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.variantId, (counts.get(r.variantId) ?? 0) + 1);
  return [...counts.entries()].find(([, count]) => count === 2)?.[0] ?? null;
}

/**
 * Resolves (get-or-creates) a product by name and a variant by color/size
 * under it, creating a fresh SKU'd variant row if neither already exists.
 * Returns whether a new variant was created so the caller knows whether to
 * also seed initial stock (vs. reconcile existing stock).
 */
async function resolveOrCreateVariantTx(
  tx: Tx,
  brand: { id: string; code: string },
  row: { productName: string; category: string; color: string; size: string },
): Promise<{ variantId: string; created: boolean }> {
  const colorAttributeId = await getOrCreateAttributeTx(tx, "Color");
  const sizeAttributeId = await getOrCreateAttributeTx(tx, "Size");

  const [existingProduct] = await tx
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.brandId, brand.id), eq(products.name, row.productName)))
    .limit(1);

  let productId: string;
  if (existingProduct) {
    productId = existingProduct.id;
  } else {
    const category = await getOrCreateCategoryTx(tx, row.category || DEFAULT_CATEGORY_NAME);
    const [created] = await tx
      .insert(products)
      .values({ brandId: brand.id, categoryId: category.id, name: row.productName, status: "active" })
      .returning({ id: products.id });
    productId = created!.id;
  }

  const colorValue = await getOrCreateAttributeValueTx(tx, colorAttributeId, row.color);
  const sizeValue = await getOrCreateAttributeValueTx(tx, sizeAttributeId, row.size);

  const matchedVariantId = await findVariantByAttributesTx(tx, productId, colorValue.id, sizeValue.id);
  if (matchedVariantId) return { variantId: matchedVariantId, created: false };

  const [productCategory] = await tx
    .select({ code: categories.code })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(eq(products.id, productId))
    .limit(1);
  if (!productCategory) throw new Error(`Product ${productId} has no resolvable category`); // unreachable

  const seqResult = await tx.execute<{ seq: string }>(sql`select nextval('product_sku_seq') as seq`);
  const sequence = Number(seqResult.rows[0]?.seq);
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

  return { variantId: variant.id, created: true };
}

/**
 * Imports rows from an uploaded .xlsx: a row with a SKU that matches an
 * existing variant is a price/stock/status UPDATE; a row without one (or
 * with one that doesn't match anything) falls back to resolving/creating a
 * product + variant by (Product Name, Color, Size) — which itself no-ops
 * into an update if that exact variant already exists, so re-importing a
 * previously exported sheet is idempotent rather than creating duplicates.
 *
 * Each row is processed independently (its own transaction where it writes
 * to the catalog) and a bad row is recorded in `errors` rather than aborting
 * the whole batch — a typo in row 214 shouldn't roll back the other 500.
 */
export async function importProductRows(buffer: Buffer, brandId: string, actorUserId: string): Promise<ImportProductsResult> {
  const [brand] = await db.select({ id: brands.id, code: brands.code }).from(brands).where(eq(brands.id, brandId)).limit(1);
  if (!brand) throw ApiError.badRequest(`Brand ${brandId} does not exist`);

  const rows = parseImportWorkbook(buffer);
  const result: ImportProductsResult = { totalRows: rows.length, created: 0, updated: 0, skipped: 0, errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const rowNumber = i + 2; // header is row 1 in the sheet

    if (!row.productName && !row.sku) {
      result.skipped++;
      continue;
    }

    try {
      const price = parsePrice(row.priceRaw);
      const stock = parseStock(row.stockRaw);
      const status = parseStatus(row.statusRaw);

      if (row.sku) {
        const [existingVariant] = await db
          .select({ id: productVariants.id })
          .from(productVariants)
          .where(eq(productVariants.sku, row.sku))
          .limit(1);

        if (!existingVariant) {
          result.errors.push({ row: rowNumber, message: `SKU "${row.sku}" doesn't match any existing variant` });
          continue;
        }

        await applyRowToVariant(existingVariant.id, { price, stock, status }, actorUserId);
        result.updated++;
        continue;
      }

      if (!row.productName || !row.color || !row.size) {
        result.errors.push({ row: rowNumber, message: "Product Name, Color, and Size are required when SKU is blank" });
        continue;
      }

      const { variantId, created } = await db.transaction((tx) =>
        resolveOrCreateVariantTx(tx, brand, {
          productName: row.productName,
          category: row.category,
          color: row.color,
          size: row.size,
        }),
      );

      // Freshly created variants have no active price row yet, so the first
      // price is a plain insert; existing ones go through updateProductVariant
      // so the fan-out-to-siblings price sync applies. Stock uses
      // setVariantStock either way — its target-quantity reconciliation
      // against a starting total of 0 is exactly "seed initial stock".
      if (price !== undefined) {
        if (created) {
          await db.insert(variantPrices).values({ variantId, price: price.toFixed(2), currency: "EGP", createdBy: actorUserId });
        } else {
          await updateProductVariant(variantId, { price }, actorUserId);
        }
      }
      if (status !== undefined) await updateProductVariant(variantId, { status }, actorUserId);
      if (stock !== undefined) await setVariantStock(variantId, stock, actorUserId);

      if (created) result.created++;
      else result.updated++;
    } catch (err) {
      result.errors.push({ row: rowNumber, message: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  return result;
}
