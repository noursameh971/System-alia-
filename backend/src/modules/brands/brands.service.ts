import { db } from "../../db/client.js";
import { brands } from "../../db/schema/index.js";

export async function listBrands() {
  return db.select({ id: brands.id, name: brands.name, code: brands.code }).from(brands).orderBy(brands.name);
}
