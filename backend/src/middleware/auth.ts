import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
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
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Verifies the Bearer JWT (issued by POST /api/auth/login) and attaches the
 * caller to req.user. Every route below this must be mounted after this
 * middleware to be protected — there is no bypass.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw ApiError.unauthorized("Missing bearer token");
  }

  const token = header.slice("Bearer ".length);

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as {
      sub: string;
      role: string;
      brandCode: string | null;
      brandId: string | null;
    };
    if (payload.role !== "admin" && payload.role !== "warehouse_staff") {
      throw ApiError.unauthorized("Invalid token payload");
    }
    req.user = {
      id: payload.sub,
      role: payload.role,
      brandCode: payload.brandCode ?? null,
      brandId: payload.brandId ?? null,
    };
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
