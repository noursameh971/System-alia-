import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { brands } from "../../db/schema/index.js";
import { ApiError } from "../../utils/apiError.js";
import type { CreateBrandInput, UpdateBrandProfileInput } from "./brands.schema.js";

/** brandId: restricts the result to a single brand — used for warehouse_staff, who shouldn't see (or switch into) other workspaces. */
export async function listBrands(brandId?: string | null) {
  return db
    .select({ id: brands.id, name: brands.name, code: brands.code })
    .from(brands)
    .where(brandId ? eq(brands.id, brandId) : undefined)
    .orderBy(brands.name);
}

export interface CreatedBrand {
  id: string;
  name: string;
  code: string;
}

/**
 * Creates a new workspace/brand. Nothing else needs to be seeded for it to
 * work: categories, warehouses/zones/bins, and attributes are all global
 * (no brandId column) and lazily get-or-created the first time a product
 * under this brand references them — see products.service.ts's
 * getOrCreateCategoryTx / getOrCreateDefaultBinTx. A brand is fully usable
 * (Products, Inventory, Orders, dashboard) the instant this row exists.
 */
export async function createBrand(input: CreateBrandInput): Promise<CreatedBrand> {
  const name = input.name.trim();
  const code = input.code.trim().toUpperCase();

  const [nameConflict] = await db.select({ id: brands.id }).from(brands).where(eq(brands.name, name)).limit(1);
  if (nameConflict) throw ApiError.conflict(`A workspace named "${name}" already exists`);

  const [codeConflict] = await db.select({ id: brands.id }).from(brands).where(eq(brands.code, code)).limit(1);
  if (codeConflict) throw ApiError.conflict(`Workspace code "${code}" is already in use`);

  const [created] = await db.insert(brands).values({ name, code }).returning({ id: brands.id, name: brands.name, code: brands.code });
  return created!;
}

export interface BrandProfile {
  id: string;
  name: string;
  code: string;
  logoUrl: string | null;
  receiptNotes: string | null;
}

/** GET-side of the Settings page's "Brand Profile" tab. */
export async function getBrandProfile(brandId: string): Promise<BrandProfile> {
  const [row] = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
  if (!row) throw ApiError.notFound(`Brand ${brandId} does not exist`);
  return { id: row.id, name: row.name, code: row.code, logoUrl: row.logoUrl, receiptNotes: row.receiptNotes };
}

/** Backs the Settings page's "Brand Profile" tab save action — business name and the receipt header notes printed on OrderReceipt. Logo uploads go through uploadBrandLogo (brands.image.service.ts) instead, since that's raw bytes, not JSON. */
export async function updateBrandProfile(brandId: string, input: UpdateBrandProfileInput): Promise<BrandProfile> {
  const [existing] = await db.select({ id: brands.id }).from(brands).where(eq(brands.id, brandId)).limit(1);
  if (!existing) throw ApiError.notFound(`Brand ${brandId} does not exist`);

  if (input.name !== undefined) {
    const [conflict] = await db
      .select({ id: brands.id })
      .from(brands)
      .where(and(eq(brands.name, input.name), ne(brands.id, brandId)))
      .limit(1);
    if (conflict) throw ApiError.conflict(`A workspace named "${input.name}" already exists`);
  }

  const [updated] = await db
    .update(brands)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.receiptNotes !== undefined ? { receiptNotes: input.receiptNotes.trim() || null } : {}),
      updatedAt: sql`now()`,
    })
    .where(eq(brands.id, brandId))
    .returning();

  return { id: updated!.id, name: updated!.name, code: updated!.code, logoUrl: updated!.logoUrl, receiptNotes: updated!.receiptNotes };
}
