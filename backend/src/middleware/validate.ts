import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";
import { ApiError } from "../utils/apiError.js";

/** Validates req.body against a Zod schema and replaces it with the parsed (typed, defaulted) value. */
export function validateBody<T>(schema: ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      throw ApiError.badRequest("Validation failed", result.error.flatten());
    }
    req.body = result.data;
    next();
  };
}
