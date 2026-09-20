import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/apiError.js";

/**
 * express.raw()/express.json() (body-parser under the hood) throw their own
 * `http-errors`-shaped errors for things like an oversized body or malformed
 * JSON — e.g. raw-body's "request entity too large" for a file over a
 * route's size limit. Those carry a real client-facing status (409, 413) and
 * an `expose: true` flag (http-errors' signal that the message is safe to
 * show the caller), but aren't `ApiError` instances, so without this check
 * they'd fall through to the generic 500 below and hide a plain "file too
 * big" mistake behind an opaque "Internal server error".
 */
function asExposedHttpError(err: unknown): { statusCode: number; message: string } | null {
  if (typeof err !== "object" || err === null || !("expose" in err) || (err as { expose?: unknown }).expose !== true) {
    return null;
  }
  const statusCode = (err as { status?: unknown; statusCode?: unknown }).status ?? (err as { statusCode?: unknown }).statusCode;
  if (typeof statusCode !== "number" || statusCode < 400 || statusCode >= 600) return null;
  const message = err instanceof Error ? err.message : "Request failed";
  return { statusCode, message };
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      success: false,
      error: { message: err.message, details: err.details },
    });
    return;
  }

  const exposedHttpError = asExposedHttpError(err);
  if (exposedHttpError) {
    res.status(exposedHttpError.statusCode).json({
      success: false,
      error: { message: exposedHttpError.message },
    });
    return;
  }

  console.error(`Unhandled error on ${req.method} ${req.path}:`, err);
  res.status(500).json({
    success: false,
    error: { message: "Internal server error" },
  });
}
