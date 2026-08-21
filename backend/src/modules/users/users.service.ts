import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { brands, users } from "../../db/schema/index.js";
import { ApiError } from "../../utils/apiError.js";
import { pgErrorCode, POSTGRES_FOREIGN_KEY_VIOLATION_CODES, withUniqueConstraint } from "../../utils/pgErrors.js";
import type { CreateUserInput, UpdateUserInput } from "./users.schema.js";

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

function toUserListItem(row: {
  id: string;
  fullName: string;
  email: string;
  role: "admin" | "warehouse_staff";
  isActive: boolean;
  createdAt: Date;
  brandId: string | null;
  brandName: string | null;
  brandCode: string | null;
}): UserListItem {
  return {
    id: row.id,
    fullName: row.fullName,
    email: row.email,
    role: row.role,
    isActive: row.isActive,
    createdAt: row.createdAt,
    brand: row.brandId ? { id: row.brandId, name: row.brandName!, code: row.brandCode! } : null,
  };
}

const userWithBrandSelection = {
  id: users.id,
  fullName: users.fullName,
  email: users.email,
  role: users.role,
  isActive: users.isActive,
  createdAt: users.createdAt,
  brandId: brands.id,
  brandName: brands.name,
  brandCode: brands.code,
} as const;

async function getUserByIdOrThrow(userId: string): Promise<UserListItem> {
  const [row] = await db
    .select(userWithBrandSelection)
    .from(users)
    .leftJoin(brands, eq(brands.id, users.brandId))
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) throw ApiError.notFound(`User ${userId} does not exist`);
  return toUserListItem(row);
}

export async function listUsers(): Promise<UserListItem[]> {
  const rows = await db
    .select(userWithBrandSelection)
    .from(users)
    .leftJoin(brands, eq(brands.id, users.brandId))
    .orderBy(users.fullName);

  return rows.map(toUserListItem);
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
      .returning({ id: users.id });
    if (!row) throw new Error("User insert returned no row"); // unreachable
    return row;
  });

  return getUserByIdOrThrow(created.id);
}

/**
 * Partial update of role / brand / isActive / fullName. Role and brand are
 * validated together against the *resulting* state (a request that only
 * changes isActive still has its existing role/brand re-checked against
 * each other), same rule createUser/login already enforce: warehouse_staff
 * requires a brand, admin forbids one.
 *
 * `actingUserId` guards against an admin deactivating their own account —
 * that's an easy way to lock every admin out of the system with one click,
 * since there'd be no one left with permission to flip it back.
 */
export async function updateUser(
  userId: string,
  actingUserId: string,
  input: UpdateUserInput,
): Promise<UserListItem> {
  const [existing] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!existing) throw ApiError.notFound(`User ${userId} does not exist`);

  if (userId === actingUserId && input.isActive === false) {
    throw ApiError.badRequest("You can't deactivate your own account");
  }

  const nextRole = input.role ?? existing.role;
  const nextBrandId = input.brandId !== undefined ? input.brandId : existing.brandId;

  if (nextRole === "warehouse_staff" && !nextBrandId) {
    throw ApiError.badRequest("brandId is required when role is 'warehouse_staff'");
  }
  if (nextRole === "admin" && nextBrandId) {
    throw ApiError.badRequest("brandId must be omitted for 'admin'");
  }
  if (nextBrandId) {
    const [brand] = await db.select().from(brands).where(eq(brands.id, nextBrandId)).limit(1);
    if (!brand) throw ApiError.badRequest(`Brand ${nextBrandId} does not exist`);
  }

  await db
    .update(users)
    .set({
      fullName: input.fullName ?? existing.fullName,
      role: nextRole,
      brandId: nextRole === "admin" ? null : nextBrandId,
      isActive: input.isActive ?? existing.isActive,
      updatedAt: sql`now()`,
    })
    .where(eq(users.id, userId));

  return getUserByIdOrThrow(userId);
}

export async function resetPassword(userId: string, password: string): Promise<void> {
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const [row] = await db
    .update(users)
    .set({ passwordHash, updatedAt: sql`now()` })
    .where(eq(users.id, userId))
    .returning({ id: users.id });
  if (!row) throw ApiError.notFound(`User ${userId} does not exist`);
}

/** Self-service password change — unlike resetPassword (admin action), this requires proving the current password first. */
export async function changeOwnPassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
  const [row] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, userId)).limit(1);
  if (!row) throw ApiError.notFound(`User ${userId} does not exist`);

  const matches = await bcrypt.compare(currentPassword, row.passwordHash);
  if (!matches) throw ApiError.unauthorized("Current password is incorrect");

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await db.update(users).set({ passwordHash, updatedAt: sql`now()` }).where(eq(users.id, userId));
}

/**
 * Hard-deletes when nothing references this account; falls back to
 * deactivating when it does (e.g. they created orders/stock movements —
 * every such FK is ON DELETE RESTRICT to preserve the audit trail). Mirrors
 * products.service.ts#deleteVariant's same fallback for the same reason.
 */
export async function deleteUser(userId: string, actingUserId: string): Promise<{ deleted: boolean }> {
  if (userId === actingUserId) {
    throw ApiError.badRequest("You can't delete your own account");
  }

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  if (!existing) throw ApiError.notFound(`User ${userId} does not exist`);

  try {
    await db.delete(users).where(eq(users.id, userId));
    return { deleted: true };
  } catch (err) {
    const code = pgErrorCode(err);
    if (!code || !POSTGRES_FOREIGN_KEY_VIOLATION_CODES.includes(code as (typeof POSTGRES_FOREIGN_KEY_VIOLATION_CODES)[number])) {
      throw err;
    }
    await db.update(users).set({ isActive: false, updatedAt: sql`now()` }).where(eq(users.id, userId));
    return { deleted: false };
  }
}
