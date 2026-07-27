import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { brands } from "../../db/schema/index.js";

/** brandId: restricts the result to a single brand — used for warehouse_staff, who shouldn't see (or switch into) other workspaces. */
export async function listBrands(brandId?: string | null) {
  return db
    .select({ id: brands.id, name: brands.name, code: brands.code })
    .from(brands)
    .where(brandId ? eq(brands.id, brandId) : undefined)
    .orderBy(brands.name);
}
