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
 * Verifies the Bearer JWT and attaches the caller to req.user.
 * Login/token-issuance is out of scope for Step 2 (products & QR codes) and
 * lands with the dedicated auth module — this only guards routes that need
 * an already-authenticated caller (e.g. to stamp created_by/performed_by).
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
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
