import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ApiError } from "../../utils/apiError.js";

/**
 * Every chat turn and every attachment read is a paid model call (a turn
 * makes several, with tool use), so a stuck client or a held-down Enter key
 * shouldn't be able to run up the bill. Fixed window per admin, in memory —
 * plenty for one backend instance and a handful of admins.
 */
const WINDOW_MS = 60_000;

function perAdminLimit(maxPerWindow: number, message: string): RequestHandler {
  const windows = new Map<string, { startedAt: number; count: number }>();
  return (req: Request, _res: Response, next: NextFunction): void => {
    const userId = req.user!.id;
    const now = Date.now();
    const current = windows.get(userId);

    if (!current || now - current.startedAt >= WINDOW_MS) {
      windows.set(userId, { startedAt: now, count: 1 });
      next();
      return;
    }
    if (current.count >= maxPerWindow) {
      throw new ApiError(429, message);
    }
    current.count += 1;
    next();
  };
}

export const chatRateLimit = perAdminLimit(20, "Too many assistant messages — wait a minute and try again");

/** Separate from chat turns: attaching three receipts shouldn't use up the next three messages. */
export const attachmentRateLimit = perAdminLimit(15, "Too many files attached in a minute — wait a moment and try again");
