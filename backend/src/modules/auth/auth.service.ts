import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { brands, users } from "../../db/schema/index.js";
import { env } from "../../config/env.js";
import { ApiError } from "../../utils/apiError.js";
import type { LoginInput } from "./auth.schema.js";

export interface SessionUser {
  id: string;
  fullName: string;
  email: string;
  role: "admin" | "warehouse_staff";
  /** Assigned workspace, lowercased (e.g. "alh"). Null for admins — they aren't scoped to one brand. */
  brandCode: string | null;
  brandId: string | null;
}

/**
 * One JWT is minted per login and carries everything the Next.js edge
 * middleware and the API's requireBrandAccess middleware need (role,
 * brandCode, brandId) so both can enforce RBAC without a DB round-trip.
 * Keep this payload small and stable — every field here is public within
 * the token and should never include anything more sensitive than what the
 * client already sees in the login response.
 */
export interface SessionTokenPayload {
  sub: string;
  role: "admin" | "warehouse_staff";
  brandCode: string | null;
  brandId: string | null;
}

export async function login({ email, password }: LoginInput): Promise<{ token: string; user: SessionUser }> {
  const [row] = await db
    .select({
      id: users.id,
      fullName: users.fullName,
      email: users.email,
      passwordHash: users.passwordHash,
      role: users.role,
      isActive: users.isActive,
      brandId: users.brandId,
      brandCode: brands.code,
    })
    .from(users)
    .leftJoin(brands, eq(brands.id, users.brandId))
    .where(eq(users.email, email))
    .limit(1);

  // Same message for "no such user" and "wrong password" — don't leak which one failed.
  if (!row || !row.isActive) {
    throw ApiError.unauthorized("Invalid email or password");
  }

  const passwordMatches = await bcrypt.compare(password, row.passwordHash);
  if (!passwordMatches) {
    throw ApiError.unauthorized("Invalid email or password");
  }

  if (row.role === "warehouse_staff" && !row.brandCode) {
    // Data-integrity guard: a staff account with no brand assigned would
    // otherwise get a token that passes every brand check trivially.
    throw ApiError.forbidden("This account has no workspace assigned — contact an admin");
  }

  const brandCode = row.role === "admin" ? null : row.brandCode!.toLowerCase();
  const brandId = row.role === "admin" ? null : row.brandId;

  const payload: SessionTokenPayload = { sub: row.id, role: row.role, brandCode, brandId };
  const token = jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });

  return {
    token,
    user: { id: row.id, fullName: row.fullName, email: row.email, role: row.role, brandCode, brandId },
  };
}
