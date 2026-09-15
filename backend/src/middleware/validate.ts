import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";
import { ApiError } from "../utils/apiError.js";

/** Validates req.body against a Zod schema and replaces it with the parsed (typed, defaulted) value. */
export function validateBody<T>(schema: ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const flattened = result.error.flatten();
      // Surface which field(s) failed and why, not just "Validation failed"
      // — that generic message is all the frontend's toast shows the user,
      // so without this a real cause (e.g. "imageUrl: a base64 data URL is
      // way over the 500-char limit") reads as an unexplained red error.
      const fieldErrors = flattened.fieldErrors as Record<string, string[] | undefined>;
      const fieldMessages = Object.entries(fieldErrors)
        .filter((entry): entry is [string, string[]] => Boolean(entry[1]?.length))
        .map(([field, messages]) => `${field}: ${messages[0]}`);
      const message = fieldMessages.length > 0 ? `Validation failed — ${fieldMessages.join("; ")}` : "Validation failed";
      throw ApiError.badRequest(message, flattened);
    }
    req.body = result.data;
    next();
  };
}
