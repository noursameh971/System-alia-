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
  rowNumber: number;
  productName: string;
  category: string;
  color: string;
  size: string;
  sku: string;
  priceRaw: string;
  stockRaw: string;
  statusRaw: string;
}

type ImportField = Exclude<keyof ParsedImportRow, "rowNumber">;

/**
 * Accepted header spellings per field, already in normalizeHeader() form
 * (lowercase, single-spaced). A bilingual header like "SKU / كود" or
 * "Price (EGP)" is also matched by its individual parts, so combinations
 * don't each need listing here.
 */
const HEADER_ALIASES: Record<ImportField, string[]> = {
  productName: ["product name", "product", "name", "item", "item name", "اسم المنتج", "المنتج", "الاسم", "اسم الصنف", "الصنف"],
  category: ["category", "الفئة", "الفئه", "التصنيف", "القسم"],
  color: ["color", "colour", "اللون", "لون"],
  size: ["size", "المقاس", "مقاس", "الحجم"],
  sku: ["sku", "code", "item code", "product code", "كود", "الكود", "كود المنتج", "رمز المنتج"],
  priceRaw: ["price", "selling price", "unit price", "السعر", "سعر", "سعر البيع", "سعر القطعة"],
  stockRaw: ["stock", "qty", "quantity", "on hand", "الكمية", "كمية", "المخزون", "الرصيد"],
  statusRaw: ["status", "state", "الحالة", "حالة"],
};

function cell(value: unknown): string {
  if (value == null) return "";
  // Zero-width marks, BOMs and non-breaking spaces are common in sheets pasted from the web or typed in Arabic.
  return String(value)
    .replace(/[\u200B-\u200F\u202A-\u202E\uFEFF\u00A0]/g, " ")
    .trim();
}

function normalizeHeader(value: unknown): string {
  return cell(value)
    .toLowerCase()
    .replace(/[_:-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Maps one header cell to a field: whole-header match first, then each "/", "|", "(…)"-separated part. */
function matchHeader(header: unknown): ImportField | null {
  const normalized = normalizeHeader(header);
  if (!normalized) return null;
  const parts = normalized
    .split(/[/|\\()[\]]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  for (const candidate of [normalized, ...parts]) {
    for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [ImportField, string[]][]) {
      if (aliases.includes(candidate)) return field;
    }
  }
  return null;
}

/** Column index → field for one candidate header row; the first column wins if a field appears twice. */
function mapHeaderRow(row: unknown[]): Map<number, ImportField> {
  const columns = new Map<number, ImportField>();
  const seen = new Set<ImportField>();
  row.forEach((header, index) => {
    const field = matchHeader(header);
    if (field && !seen.has(field)) {
      seen.add(field);
      columns.set(index, field);
    }
  });
  return columns;
}

function hasUsableHeaders(columns: Map<number, ImportField>): boolean {
  const fields = new Set(columns.values());
  return fields.has("sku") || (fields.has("productName") && fields.has("color") && fields.has("size"));
}

const HEADER_SCAN_ROWS = 10;

/**
 * Reads the uploaded workbook into rows. Rather than requiring the export's
 * exact English headers on row 1 of the first sheet, it scans the first few
 * rows of each sheet for a header row it recognizes (English or Arabic, any
 * case/spacing) — so hand-made sheets with a title row above the headers,
 * or a cover sheet in front, still import.
 */
function parseImportWorkbook(buffer: Buffer): ParsedImportRow[] {
  let workbook: ReturnType<typeof xlsx.read>;
  try {
    workbook = xlsx.read(buffer, { type: "buffer" });
  } catch {
    throw ApiError.badRequest("Couldn't read that file — please upload a valid Excel workbook (.xlsx)");
  }
  if (workbook.SheetNames.length === 0) throw ApiError.badRequest("The workbook has no sheets");

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const grid = xlsx.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", blankrows: true });

    for (let headerIndex = 0; headerIndex < Math.min(grid.length, HEADER_SCAN_ROWS); headerIndex++) {
      const columns = mapHeaderRow(grid[headerIndex] ?? []);
      if (!hasUsableHeaders(columns)) continue;

      const rows: ParsedImportRow[] = [];
      for (let i = headerIndex + 1; i < grid.length; i++) {
        const values = grid[i] ?? [];
        const row: ParsedImportRow = {
          rowNumber: i + 1, // 1-based, as Excel shows it
          productName: "",
          category: "",
          color: "",
          size: "",
          sku: "",
          priceRaw: "",
          stockRaw: "",
          statusRaw: "",
        };
        for (const [index, field] of columns) row[field] = cell(values[index]);
        row.statusRaw = row.statusRaw.toLowerCase();
        if (values.some((v) => cell(v) !== "")) rows.push(row);
      }
      return rows;
    }
  }

  throw ApiError.badRequest(
    'Couldn\'t find the column headers. The sheet needs either a "SKU / كود" column, or "Product Name / اسم المنتج" + "Color / اللون" + "Size / المقاس" columns (plus optional "Price / السعر" and "Stock / الكمية").',
  );
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

/** Accepts Arabic-Indic digits, thousands separators and a currency label ("1,250 EGP", "١٢٥٠ ج.م"). */
function toNumber(raw: string): number {
  const ascii = raw
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\u066B/g, ".")
    .replace(/egp|l\.?e\.?|ج\.?\s?م\.?|جنيه/gi, "")
    .replace(/[,\u066C\s]/g, "");
  return ascii === "" ? Number.NaN : Number(ascii);
}

function parsePrice(raw: string): number | undefined {
  if (!raw) return undefined;
  const value = toNumber(raw);
  if (Number.isNaN(value) || value <= 0) throw new Error(`Price "${raw}" isn't a valid number above 0`);
  return value;
}

function parseStock(raw: string): number | undefined {
  if (!raw) return undefined;
  const value = toNumber(raw);
  if (Number.isNaN(value) || value < 0 || !Number.isInteger(value)) {
    throw new Error(`Stock "${raw}" must be a whole number, 0 or more`);
  }
  return value;
}

const STATUS_ALIASES: Record<string, "active" | "discontinued"> = {
  active: "active",
  yes: "active",
  true: "active",
  نشط: "active",
  مفعل: "active",
  متاح: "active",
  discontinued: "discontinued",
  inactive: "discontinued",
  no: "discontinued",
  false: "discontinued",
  متوقف: "discontinued",
  "غير نشط": "discontinued",
  "غير متاح": "discontinued",
};

function parseStatus(raw: string): "active" | "discontinued" | undefined {
  if (!raw) return undefined;
  const status = STATUS_ALIASES[raw];
  if (status) return status;
  throw new Error(`Status "${raw}" isn't recognized — use "active" or "discontinued"`);
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
    .where(and(eq(products.brandId, brand.id), sql`lower(trim(${products.name})) = lower(${row.productName})`))
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
    .values({ productId, sku, qrCodeValue: await buildQrPayload(tx), status: "active" })
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
  if (rows.length === 0) throw ApiError.badRequest("Found the header row, but there are no data rows below it to import");
  const result: ImportProductsResult = { totalRows: rows.length, created: 0, updated: 0, skipped: 0, errors: [] };

  for (const row of rows) {
    const rowNumber = row.rowNumber;

    if (!row.productName && !row.sku) {
      result.skipped++;
      continue;
    }

    try {
      const price = parsePrice(row.priceRaw);
      const stock = parseStock(row.stockRaw);
      const status = parseStatus(row.statusRaw);

      if (row.sku) {
        // Scoped to the import's brand so a stray SKU can't edit another brand's catalog;
        // case-insensitive because generated SKUs are upper-case but hand-typed ones often aren't.
        const [existingVariant] = await db
          .select({ id: productVariants.id })
          .from(productVariants)
          .innerJoin(products, eq(products.id, productVariants.productId))
          .where(and(eq(products.brandId, brand.id), sql`upper(${productVariants.sku}) = upper(${row.sku})`))
          .limit(1);

        if (existingVariant) {
          await applyRowToVariant(existingVariant.id, { price, stock, status }, actorUserId);
          result.updated++;
          continue;
        }

        // Unknown SKU: fall back to Name + Color + Size matching when the row has them.
        if (!row.productName || !row.color || !row.size) {
          result.errors.push({
            row: rowNumber,
            message: `SKU "${row.sku}" doesn't match any product in this brand — correct the SKU, or fill in Product Name, Color and Size to match by name instead`,
          });
          continue;
        }
      }

      if (!row.productName || !row.color || !row.size) {
        const missing = [!row.productName && "Product Name", !row.color && "Color", !row.size && "Size"].filter(Boolean).join(", ");
        result.errors.push({ row: rowNumber, message: `Missing ${missing} — needed to match or create a product when there's no SKU` });
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
      result.errors.push({ row: rowNumber, message: err instanceof Error ? err.message : "Unexpected error while saving this row" });
    }
  }

  return result;
}
