import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { env } from "../config/env.js";
import { db } from "../db/client.js";
import { brands, users } from "../db/schema/index.js";
import { ApiError } from "../utils/apiError.js";

export interface AuthenticatedUser {
  id: string;
  role: "admin" | "warehouse_staff";
  /** Assigned workspace, lowercased (e.g. "alh"). Null for admins. */
  brandCode: string | null;
  /** Assigned workspace's id — lets brand-scoped routes compare against the ?brandId= query/body param directly. Null for admins. */
  brandId: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Verifies the Bearer JWT (issued by POST /api/auth/login), then re-checks
 * the caller against the database before attaching them to req.user.
 *
 * Why hit the DB on every request instead of trusting the token's claims:
 * a JWT is a bearer credential valid until it expires (JWT_EXPIRES_IN,
 * default 8h) — with no server-side state, deactivating a user (or a
 * warehouse_staff being reassigned/promoted) wouldn't take effect until
 * their token naturally expired. In a warehouse, an ex-employee keeping
 * hours of access after termination is a real risk (bad stock counts, fake
 * returns), not a theoretical one. This adds one indexed primary-key lookup
 * per request (join on the same PK the row would be fetched by anyway) to
 * buy instant revocation instead of a token blocklist — role and brand
 * assignment come from this same query, not the token, so an edit made via
 * PATCH /api/users/:id also takes effect on the caller's very next request,
 * not at their next login.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw ApiError.unauthorized("Missing bearer token");
  }

  const token = header.slice("Bearer ".length);

  let subject: string;
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { sub: string };
    subject = payload.sub;
  } catch {
    throw ApiError.unauthorized("Invalid or expired token");
  }

  const [row] = await db
    .select({ role: users.role, isActive: users.isActive, brandId: users.brandId, brandCode: brands.code })
    .from(users)
    .leftJoin(brands, eq(brands.id, users.brandId))
    .where(eq(users.id, subject))
    .limit(1);

  if (!row || !row.isActive) {
    throw ApiError.unauthorized("This account is no longer active");
  }

  req.user = {
    id: subject,
    role: row.role,
    brandCode: row.role === "admin" ? null : (row.brandCode?.toLowerCase() ?? null),
    brandId: row.role === "admin" ? null : row.brandId,
  };
  next();
}

export function requireRole(...allowedRoles: AuthenticatedUser["role"][]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw ApiError.unauthorized();
    }
    if (!allowedRoles.includes(req.user.role)) {
      throw ApiError.forbidden(`Requires role: ${allowedRoles.join(" or ")}`);
    }
    next();
  };
}

/**
 * Defense-in-depth for brand-scoped routes: the [brand] URL segment and
 * proxy.ts (the Next.js frontend's route guard) already keep a warehouse_staff user's browser from
 * navigating outside their workspace, but that's a client-side redirect and
 * doesn't stop a direct API call with a different ?brandId=. This confirms
 * the brandId the caller is asking for (in query or body — wherever the
 * route puts it) matches the workspace baked into their token.
 *
 * Admins pass through untouched — they aren't scoped to one brand.
 * A warehouse_staff request with no brandId at all is also rejected: every
 * brand-scoped list/create endpoint should always be called with one from
 * that role, and silently defaulting to "all brands" would be a bigger hole
 * than requiring it explicitly.
 */
export function requireBrandAccess(source: "query" | "body" = "query") {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw ApiError.unauthorized();
    }
    if (req.user.role === "admin") {
      next();
      return;
    }

    const requestedBrandId = (source === "query" ? req.query.brandId : req.body?.brandId) as
      | string
      | undefined;

    if (!requestedBrandId || requestedBrandId !== req.user.brandId) {
      throw ApiError.forbidden("You don't have access to that brand's data");
    }
    next();
  };
}
