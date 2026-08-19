import { eq } from "drizzle-orm";
import { db, pool } from "../db/client.js";
import { brands, products, productVariants } from "../db/schema/index.js";

async function main(): Promise<void> {
  const brandRows = await db.select({ id: brands.id, name: brands.name, code: brands.code }).from(brands);
  console.log("Brands:");
  console.table(brandRows);

  const productRows = await db.select({ id: products.id, brandId: products.brandId, name: products.name, status: products.status }).from(products).limit(20);
  console.log("Products:");
  console.table(productRows);

  const variantRows = await db.select({ id: productVariants.id, productId: productVariants.productId, sku: productVariants.sku }).from(productVariants).limit(20);
  console.log("Variants:");
  console.table(variantRows);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
