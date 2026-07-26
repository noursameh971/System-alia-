import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { ApiError } from "../utils/apiError.js";

export interface AuthenticatedUser {
  id: string;
  role: "admin" | "warehouse_staff";
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Placeholder user id used by the AUTH_BYPASS dev shortcut below when the
 * caller doesn't supply x-mock-user-id. created_by/performed_by columns are
 * NOT NULL FKs into `users`, so a row with this exact id must exist locally
 * (see backend/README.md's seed snippet) or every write will fail its FK
 * check — that's intentional, it keeps the bypass from silently attributing
 * writes to a user that doesn't really exist.
 */
export const DEV_MOCK_ADMIN_ID = "00000000-0000-0000-0000-000000000001";

/**
 * TEMPORARY, Step-3-only: when AUTH_BYPASS=true, every request is treated as
 * an authenticated user with no token check at all, so the warehouse/
 * inventory APIs can be exercised from Postman before the real login/JWT
 * module exists. Override the identity per-request with `x-mock-user-id`
 * and `x-mock-role` headers (e.g. to test the admin-only routes as
 * warehouse_staff and confirm they 403).
 *
 * Guardrails: env.ts refuses to boot with AUTH_BYPASS=true when
 * NODE_ENV=production, and server startup logs a loud warning whenever it's
 * on. Still, this whole branch should be deleted once real auth ships —
 * don't let it linger past local testing.
 */
function applyMockAuth(req: Request): void {
  const roleHeader = req.header("x-mock-role");
  const role = roleHeader === "warehouse_staff" ? "warehouse_staff" : "admin";
  req.user = {
    id: req.header("x-mock-user-id") || DEV_MOCK_ADMIN_ID,
    role,
  };
}

/**
 * Verifies the Bearer JWT and attaches the caller to req.user.
 * Login/token-issuance is out of scope for these early steps and lands with
 * the dedicated auth module — this only guards routes that need an
 * already-authenticated caller (e.g. to stamp created_by/performed_by).
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (env.AUTH_BYPASS) {
    applyMockAuth(req);
    next();
    return;
  }

  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw ApiError.unauthorized("Missing bearer token");
  }

  const token = header.slice("Bearer ".length);

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { sub: string; role: string };
    if (payload.role !== "admin" && payload.role !== "warehouse_staff") {
      throw ApiError.unauthorized("Invalid token payload");
    }
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    throw ApiError.unauthorized("Invalid or expired token");
  }
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
