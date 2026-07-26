import { db } from "../../db/client.js";
import { categories } from "../../db/schema/index.js";

export async function listCategories() {
  return db
    .select({ id: categories.id, name: categories.name, code: categories.code })
    .from(categories)
    .orderBy(categories.name);
}
