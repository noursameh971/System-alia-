import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { categories } from "../../db/schema/index.js";
import { ApiError } from "../../utils/apiError.js";

export async function listCategories() {
  return db
    .select({ id: categories.id, name: categories.name, code: categories.code })
    .from(categories)
    .orderBy(categories.name);
}

/**
 * Renames a category in place — its `code` column (embedded in every SKU
 * already generated under it) is left untouched, so existing SKUs stay
 * valid. Every product referencing this category's id picks up the new
 * name automatically via the FK join in listProductsWithVariants, so
 * there's no per-product update to cascade here.
 */
export async function renameCategory(categoryId: string, newName: string): Promise<{ id: string; name: string; code: string }> {
  const name = newName.trim();

  const [existing] = await db.select({ id: categories.id }).from(categories).where(eq(categories.id, categoryId)).limit(1);
  if (!existing) throw ApiError.notFound(`Category ${categoryId} does not exist`);

  const [conflict] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.name, name), ne(categories.id, categoryId)))
    .limit(1);
  if (conflict) throw ApiError.conflict(`A category named "${name}" already exists`);

  const [updated] = await db
    .update(categories)
    .set({ name, updatedAt: sql`now()` })
    .where(eq(categories.id, categoryId))
    .returning({ id: categories.id, name: categories.name, code: categories.code });
  return updated!;
}
