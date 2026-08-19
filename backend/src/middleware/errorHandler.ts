import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/apiError.js";

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      success: false,
      error: { message: err.message, details: err.details },
    });
    return;
  }

  console.error(`Unhandled error on ${req.method} ${req.path}:`, err);
  res.status(500).json({
    success: false,
    error: { message: "Internal server error" },
  });
}
