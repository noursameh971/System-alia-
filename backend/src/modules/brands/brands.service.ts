import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { brands } from "../../db/schema/index.js";
import { ApiError } from "../../utils/apiError.js";
import { pgErrorCode, POSTGRES_FOREIGN_KEY_VIOLATION_CODES } from "../../utils/pgErrors.js";
import type { CreateBrandInput, UpdateBrandProfileInput } from "./brands.schema.js";

/**
 * brandId: restricts the result to a single brand — used for warehouse_staff,
 * who shouldn't see (or switch into) other workspaces. Always excludes
 * deactivated brands (see deleteBrand) — same convention as
 * users.service.ts's isActive filtering, so a deleted workspace disappears
 * from the switcher and picker immediately rather than needing a separate
 * "show inactive" toggle nobody asked for.
 */
export async function listBrands(brandId?: string | null) {
  return db
    .select({ id: brands.id, name: brands.name, code: brands.code })
    .from(brands)
    .where(brandId ? and(eq(brands.id, brandId), eq(brands.isActive, true)) : eq(brands.isActive, true))
    .orderBy(brands.name);
}

/**
 * Deletes a workspace/brand — real row delete when nothing references it,
 * otherwise falls back to deactivating (isActive: false) so the brand's
 * products/orders/users history doesn't get orphaned or block the request
 * with a raw FK error. Exactly the same hard-delete-or-deactivate pattern
 * already used by deleteUser (users.service.ts) and deleteVariant
 * (products.service.ts).
 *
 * Refuses to remove the last active brand: with zero workspaces left, every
 * warehouse_staff account (which must be scoped to one) would be locked out
 * with no page to land on, and the admin dashboard would have nothing to show.
 */
export async function deleteBrand(brandId: string): Promise<{ deleted: boolean }> {
  const [existing] = await db.select({ id: brands.id }).from(brands).where(eq(brands.id, brandId)).limit(1);
  if (!existing) throw ApiError.notFound(`Brand ${brandId} does not exist`);

  const [activeCountRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(brands)
    .where(eq(brands.isActive, true));
  if ((activeCountRow?.count ?? 0) <= 1) {
    throw ApiError.badRequest("You can't delete the last remaining workspace");
  }

  try {
    await db.delete(brands).where(eq(brands.id, brandId));
    return { deleted: true };
  } catch (err) {
    const code = pgErrorCode(err);
    if (!code || !POSTGRES_FOREIGN_KEY_VIOLATION_CODES.includes(code as (typeof POSTGRES_FOREIGN_KEY_VIOLATION_CODES)[number])) {
      throw err;
    }
    await db.update(brands).set({ isActive: false, updatedAt: sql`now()` }).where(eq(brands.id, brandId));
    return { deleted: false };
  }
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
