import { eq, ilike } from "drizzle-orm";
import { db, pool } from "../db/client.js";
import { brands, users } from "../db/schema/index.js";

function readArg(flag: string): string | undefined {
  const prefix = `--${flag}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg?.slice(prefix.length);
}

async function main(): Promise<void> {
  const email = (readArg("email") ?? process.env.ADMIN_EMAIL ?? "admin@alia.com").toLowerCase();
  const brandName = readArg("brand") ?? process.env.BRAND_NAME ?? "Alia Hijab";
  const role = ((readArg("role") ?? process.env.USER_ROLE ?? "admin").toLowerCase() as "admin" | "warehouse_staff") || "admin";

  let brand = (await db
    .select({ id: brands.id, name: brands.name })
    .from(brands)
    .where(ilike(brands.name, `%${brandName}%`))
    .limit(1))[0];

  if (!brand) {
    const [createdBrand] = await db
      .insert(brands)
      .values({ name: brandName, code: brandName.replace(/\s+/g, "").slice(0, 10).toUpperCase() || "ALIA" })
      .returning({ id: brands.id, name: brands.name });
    brand = createdBrand;
  }

  const [user] = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.email, email)).limit(1);

  if (!user) {
    throw new Error(`User not found: ${email}`);
  }

  await db.update(users).set({ brandId: brand.id, role, isActive: true }).where(eq(users.id, user.id));

  console.log(`Linked ${email} to brand ${brand.name} (${brand.id}) as ${role}.`);
}

main()
  .catch((err) => {
    console.error("link-user-to-brand failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
