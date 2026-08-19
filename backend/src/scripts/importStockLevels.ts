/**
 * Reads the "رصيد المخزن" (stock balance) sheet of المخزون.xlsx and sets
 * each matching variant's stock to its "المتاح" (available) quantity.
 *
 * That sheet has no barcode column, so rows are matched to variants by
 * (product name, color, size) — normalized case-insensitively and with
 * whitespace collapsed/stripped, since the same product appears with
 * slightly different spacing/casing between this sheet and "دليل المنتجات"
 * (the sheet forceImport.ts used to create the catalog in the first place).
 * Every write goes through products.service.ts's setVariantStock, so it's
 * the exact same audited "adjustment" movement path as the Product
 * Profile drawer's inline stock editor — no separate/undocumented write path.
 */
import xlsx from "xlsx";
import fs from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, pool } from "../db/client.js";
import { attributeValues, attributes, brands, products, productVariants, users, variantAttributeValues } from "../db/schema/index.js";
import { setVariantStock } from "../modules/products/products.service.js";

const SHEET_NAME = "رصيد المخزن";
const BRAND_NAME = "Alia Hijab";
const ADMIN_EMAIL = "admin@alia.com";

interface RawRow {
  المنتج?: unknown;
  اللون?: unknown;
  المقاس?: unknown;
  المتاح?: unknown;
}

interface StockRow {
  key: string;
  name: string;
  color: string;
  size: string;
  available: number;
}

function cell(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function readArg(flag: string): string | undefined {
  const prefix = `--${flag}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

/** Case-insensitive, whitespace-normalized key so rows match variants regardless of the source sheet's inconsistent spacing/casing. */
function matchKey(name: string, color: string, size: string): string {
  const n = name.toLowerCase().replace(/\s+/g, " ").trim();
  const c = color.toLowerCase().trim();
  const s = size.toLowerCase().replace(/\s+/g, "");
  return `${n}|${c}|${s}`;
}

function parseWorkbook(filePath: string): { rows: StockRow[]; totalSheetRows: number; skipped: number } {
  const workbook = xlsx.readFile(filePath);
  const sheet = workbook.Sheets[SHEET_NAME];
  if (!sheet) {
    throw new Error(`Sheet "${SHEET_NAME}" not found. Available sheets: ${workbook.SheetNames.join(", ")}`);
  }

  const raw = xlsx.utils.sheet_to_json(sheet, { defval: "", raw: false }) as RawRow[];
  const rows: StockRow[] = [];
  let skipped = 0;

  for (const r of raw) {
    const name = cell(r["المنتج"]);
    const color = cell(r["اللون"]);
    const size = cell(r["المقاس"]);
    const availableText = cell(r["المتاح"]);
    const available = Number(availableText);

    if (!name || !color || !size || !availableText || !Number.isFinite(available) || available < 0) {
      skipped += 1;
      continue;
    }

    rows.push({ key: matchKey(name, color, size), name, color, size, available: Math.round(available) });
  }

  return { rows, totalSheetRows: raw.length, skipped };
}

async function main(): Promise<void> {
  const filePath = path.resolve(readArg("file") ?? process.env.ALIA_IMPORT_FILE ?? "المخزون.xlsx");
  await fs.access(filePath);

  const { rows, totalSheetRows, skipped } = parseWorkbook(filePath);
  console.log(`Sheet "${SHEET_NAME}": ${totalSheetRows} total rows, ${rows.length} usable, ${skipped} skipped (missing product/color/size/available).`);

  const [brand] = await db.select().from(brands).where(eq(brands.name, BRAND_NAME)).limit(1);
  if (!brand) throw new Error(`Brand "${BRAND_NAME}" not found — expected it to already exist.`);

  const [adminUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, ADMIN_EMAIL)).limit(1);
  if (!adminUser) throw new Error(`User "${ADMIN_EMAIL}" not found — needed as the stock movement's performedBy.`);

  // Build a (product name, color, size) -> variantId lookup for every
  // existing variant of this brand, normalized the same way as matchKey().
  const variantRows = await db
    .select({
      variantId: productVariants.id,
      productName: products.name,
      attributeName: attributes.name,
      value: attributeValues.value,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .innerJoin(variantAttributeValues, eq(variantAttributeValues.variantId, productVariants.id))
    .innerJoin(attributeValues, eq(attributeValues.id, variantAttributeValues.attributeValueId))
    .innerJoin(attributes, eq(attributes.id, attributeValues.attributeId))
    .where(eq(products.brandId, brand.id));

  const colorByVariant = new Map<string, string>();
  const sizeByVariant = new Map<string, string>();
  const nameByVariant = new Map<string, string>();
  for (const row of variantRows) {
    nameByVariant.set(row.variantId, row.productName);
    if (row.attributeName.toLowerCase() === "color") colorByVariant.set(row.variantId, row.value);
    if (row.attributeName.toLowerCase() === "size") sizeByVariant.set(row.variantId, row.value);
  }

  const variantIdByKey = new Map<string, string>();
  for (const variantId of nameByVariant.keys()) {
    const color = colorByVariant.get(variantId);
    const size = sizeByVariant.get(variantId);
    if (!color || !size) continue; // shouldn't happen — every variant gets both attributes on creation
    variantIdByKey.set(matchKey(nameByVariant.get(variantId)!, color, size), variantId);
  }

  let matched = 0;
  const unmatched: StockRow[] = [];

  for (const row of rows) {
    const variantId = variantIdByKey.get(row.key);
    if (!variantId) {
      unmatched.push(row);
      continue;
    }
    matched += 1;
    await setVariantStock(variantId, row.available, adminUser.id);
  }

  console.log(`Matched ${matched}/${rows.length} rows to existing variants — each set to its "المتاح" quantity.`);
  if (unmatched.length > 0) {
    console.log(`Unmatched (${unmatched.length}) — no variant found for this product/color/size combination:`);
    for (const row of unmatched) {
      console.log(`  - "${row.name}" / ${row.color} / ${row.size} (available: ${row.available})`);
    }
  }
}

main()
  .catch((err) => {
    console.error("Stock import failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
