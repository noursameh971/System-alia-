import xlsx from "xlsx";
import bcrypt from "bcryptjs";
import { and, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { db, pool } from "../db/client.js";
import {
  brands,
  categories,
  inventory,
  productVariants,
  products,
  users,
  variantPrices,
  warehouseBins,
  warehouseZones,
  warehouses,
} from "../db/schema/index.js";
import { buildVariantSku } from "../utils/skuGenerator.js";

interface ImportRow {
  product?: string;
  color?: string;
  size?: string;
  price?: string | number;
  active?: string | boolean;
  barcode?: string | number;
}

interface ImportPayload {
  name: string;
  description: string;
  price: number;
  sku: string;
  qrCodeValue: string;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "item";
}

interface BrandRecord {
  id: string;
}

function readArg(flag: string): string | undefined {
  const prefix = `--${flag}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg?.slice(prefix.length);
}

function normalizeCell(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value.trim();
  return String(value).trim();
}

function normalizeHeader(header: string): string {
  const normalized = header.trim().toLowerCase();
  if (["product", "المنتج", "اسم المنتج", "name"].includes(normalized)) return "product";
  if (["color", "اللون"].includes(normalized)) return "color";
  if (["size", "المقاس", "المقاس/الحجم", "الحجم", "المقاس/الحجم"] .includes(normalized)) return "size";
  if (["price", "السعر", "التكلفة", "سعر القطعة", "السعر/القطعة"].includes(normalized)) return "price";
  if (["active", "نشط", "الحالة", "status"].includes(normalized)) return "active";
  if (["barcode", "باركود", "barcode_value", "qr", "qr code", "الباركود"].includes(normalized)) return "barcode";
  return normalized;
}

export function buildImportPayload(row: Record<string, unknown> | ImportRow, sequence = 1): ImportPayload {
  const product = normalizeCell(row.product);
  const color = normalizeCell(row.color);
  const size = normalizeCell(row.size);
  const priceText = normalizeCell(row.price).replace(/,/g, "");
  const price = Number(priceText || 0);
  const active = normalizeCell(row.active).toLowerCase();

  if (active && !["true", "1", "yes", "y", "نشط", "مفعل"].includes(active)) {
    return {
      name: "",
      description: "",
      price: 0,
      sku: "",
      qrCodeValue: "",
    };
  }

  const nameParts = [product, color, size].filter(Boolean);
  const name = nameParts.length > 0 ? nameParts.join(" - ") : `Imported product ${sequence}`;
  const descriptionParts = [color ? `اللون: ${color}` : undefined, size ? `المقاس: ${size}` : undefined].filter(Boolean);
  const description = descriptionParts.length > 0 ? descriptionParts.join(" | ") : "منتج مستورد";

  const sequenceLabel = String(sequence).padStart(3, "0");
  const barcode = normalizeCell(row.barcode);

  return {
    name,
    description,
    price: Number.isFinite(price) ? price : 0,
    sku: barcode || `ALIA-${sequenceLabel}`,
    qrCodeValue: barcode || `ALIA-${sequenceLabel}`,
  };
}

async function getOrCreateBrand(name: string, code: string): Promise<BrandRecord> {
  const existing = await db.select({ id: brands.id }).from(brands).where(eq(brands.name, name)).limit(1);
  if (existing[0]) return existing[0];

  const created = await db
    .insert(brands)
    .values({ name, code })
    .returning({ id: brands.id });

  return created[0]!;
}

async function getOrCreateCategory(name: string, code: string): Promise<BrandRecord> {
  const existing = await db.select({ id: categories.id }).from(categories).where(eq(categories.name, name)).limit(1);
  if (existing[0]) return existing[0];

  const created = await db
    .insert(categories)
    .values({ name, code })
    .returning({ id: categories.id });

  return created[0]!;
}

async function getOrCreateWarehouse(name: string, address: string): Promise<BrandRecord> {
  const existing = await db.select({ id: warehouses.id }).from(warehouses).where(eq(warehouses.name, name)).limit(1);
  if (existing[0]) return existing[0];

  const created = await db
    .insert(warehouses)
    .values({ name, address })
    .returning({ id: warehouses.id });

  return created[0]!;
}

async function getOrCreateZone(warehouseId: string, code: string, name: string): Promise<BrandRecord> {
  const existing = await db
    .select({ id: warehouseZones.id })
    .from(warehouseZones)
    .where(and(eq(warehouseZones.warehouseId, warehouseId), eq(warehouseZones.code, code)))
    .limit(1);
  if (existing[0]) return existing[0];

  const created = await db
    .insert(warehouseZones)
    .values({ warehouseId, code, name })
    .returning({ id: warehouseZones.id });

  return created[0]!;
}

async function getOrCreateBin(zoneId: string, code: string): Promise<BrandRecord> {
  const existing = await db
    .select({ id: warehouseBins.id })
    .from(warehouseBins)
    .where(and(eq(warehouseBins.zoneId, zoneId), eq(warehouseBins.code, code)))
    .limit(1);
  if (existing[0]) return existing[0];

  const created = await db
    .insert(warehouseBins)
    .values({ zoneId, code })
    .returning({ id: warehouseBins.id });

  return created[0]!;
}

async function getOrCreateSystemUser(): Promise<BrandRecord> {
  const email = "system@aliahijab.local";
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing[0]) return existing[0];

  const passwordHash = await bcrypt.hash("ChangeMe123!", 10);
  const created = await db
    .insert(users)
    .values({
      id: randomUUID(),
      fullName: "System Importer",
      email,
      passwordHash,
      role: "admin",
      brandId: null,
      isActive: true,
    })
    .returning({ id: users.id });

  return created[0]!;
}

async function ensureProductPayload(
  brandId: string,
  categoryId: string,
  payload: ImportPayload,
  createdBy: string,
  binId: string,
): Promise<void> {
  const existing = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.brandId, brandId), eq(products.name, payload.name)))
    .limit(1);

  if (existing[0]) return;

  const [createdProduct] = await db
    .insert(products)
    .values({
      brandId,
      categoryId,
      name: payload.name,
      description: payload.description,
      status: "active",
    })
    .returning({ id: products.id, name: products.name });

  if (!createdProduct) throw new Error(`Unable to create product: ${payload.name}`);

  const sku = payload.sku || `ALH-${slugify(payload.name)}-${String(Date.now()).slice(-4)}`;
  const [createdVariant] = await db
    .insert(productVariants)
    .values({
      productId: createdProduct.id,
      sku,
      qrCodeValue: payload.qrCodeValue || sku,
      status: "active",
    })
    .returning({ id: productVariants.id });

  if (!createdVariant) throw new Error(`Unable to create variant for: ${payload.name}`);

  await db.insert(variantPrices).values({
    variantId: createdVariant.id,
    price: String(payload.price),
    currency: "EGP",
    createdBy,
  });

  await db.insert(inventory).values({
    variantId: createdVariant.id,
    binId,
    quantity: 1,
  });
}

export async function importAliaWorkbook(filePath: string, sheetName = "دليل المنتجات"): Promise<number> {
  const resolvedPath = path.resolve(filePath);
  await fs.access(resolvedPath);

  const workbook = xlsx.readFile(resolvedPath);
  const sheet = workbook.Sheets[sheetName] ?? Object.values(workbook.Sheets).find((candidate) => candidate?.name?.toLowerCase() === sheetName.toLowerCase());

  if (!sheet) {
    throw new Error(`Unable to find sheet "${sheetName}" in ${resolvedPath}`);
  }

  const rows = xlsx.utils.sheet_to_json(sheet, { defval: "", raw: false }) as Array<Record<string, unknown>>;
  const normalizedRows = rows.map((row) => {
    const normalized: Record<string, unknown> = {};
    Object.entries(row).forEach(([key, value]) => {
      normalized[normalizeHeader(key)] = value;
    });
    return normalized as ImportRow;
  });

  const brand = await getOrCreateBrand("Alia Hijab", "ALH");
  const category = await getOrCreateCategory("General", "GEN");
  const brandId = brand.id;
  const categoryId = category.id;
  const warehouse = await getOrCreateWarehouse("Alia Hijab Warehouse", "Cairo, Egypt");
  const zone = await getOrCreateZone(warehouse.id, "MAIN", "Main");
  const bin = await getOrCreateBin(zone.id, "BIN-01");
  const importerUser = await getOrCreateSystemUser();

  let importedCount = 0;
  for (const [index, row] of normalizedRows.entries()) {
    const payload = buildImportPayload(row, index + 1);
    if (!payload.name || (payload.name.includes("Imported product") && !row.product)) {
      continue;
    }
    await ensureProductPayload(brandId, categoryId, payload, importerUser.id, bin.id);
    importedCount += 1;
  }

  return importedCount;
}

async function main(): Promise<void> {
  const filePath = readArg("file") ?? process.env.ALIA_IMPORT_FILE ?? path.resolve(process.cwd(), "../المخزون.xlsx");
  const sheetName = readArg("sheet") ?? process.env.ALIA_IMPORT_SHEET ?? "دليل المنتجات";

  try {
    const importedCount = await importAliaWorkbook(filePath, sheetName);
    console.log(`Imported ${importedCount} products into the Alia Hijab workspace.`);
  } catch (error) {
    console.error(`Import failed: ${error instanceof Error ? error.message : error}`);
    console.error(`Pass --file=/absolute/path/to/المخزون.xlsx to run the import against a workbook.`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main()
    .catch((err) => {
      console.error("Import failed:", err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}
