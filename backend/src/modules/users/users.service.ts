import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { brands, users } from "../../db/schema/index.js";
import { ApiError } from "../../utils/apiError.js";
import { withUniqueConstraint } from "../../utils/pgErrors.js";
import type { CreateUserInput } from "./users.schema.js";

const BCRYPT_ROUNDS = 10;

export interface UserListItem {
  id: string;
  fullName: string;
  email: string;
  role: "admin" | "warehouse_staff";
  isActive: boolean;
  createdAt: Date;
  brand: { id: string; name: string; code: string } | null;
}

export async function listUsers(): Promise<UserListItem[]> {
  const rows = await db
    .select({
      id: users.id,
      fullName: users.fullName,
      email: users.email,
      role: users.role,
      isActive: users.isActive,
      createdAt: users.createdAt,
      brandId: brands.id,
      brandName: brands.name,
      brandCode: brands.code,
    })
    .from(users)
    .leftJoin(brands, eq(brands.id, users.brandId))
    .orderBy(users.fullName);

  return rows.map((row) => ({
    id: row.id,
    fullName: row.fullName,
    email: row.email,
    role: row.role,
    isActive: row.isActive,
    createdAt: row.createdAt,
    brand: row.brandId ? { id: row.brandId, name: row.brandName!, code: row.brandCode! } : null,
  }));
}

export async function createUser(input: CreateUserInput): Promise<UserListItem> {
  if (input.brandId) {
    const [brand] = await db.select().from(brands).where(eq(brands.id, input.brandId)).limit(1);
    if (!brand) throw ApiError.badRequest(`Brand ${input.brandId} does not exist`);
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  const created = await withUniqueConstraint(`A user with email "${input.email}" already exists`, async () => {
    const [row] = await db
      .insert(users)
      .values({
        fullName: input.fullName,
        email: input.email,
        passwordHash,
        role: input.role,
        brandId: input.brandId ?? null,
      })
      .returning();
    if (!row) throw new Error("User insert returned no row"); // unreachable
    return row;
  });

  const [brand] = created.brandId
    ? await db.select().from(brands).where(eq(brands.id, created.brandId)).limit(1)
    : [null];

  return {
    id: created.id,
    fullName: created.fullName,
    email: created.email,
    role: created.role,
    isActive: created.isActive,
    createdAt: created.createdAt,
    brand: brand ? { id: brand.id, name: brand.name, code: brand.code } : null,
  };
}
