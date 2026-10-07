import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../../utils/apiError.js";

/**
 * Every chat turn is a paid API call (several, with tool use), so a stuck
 * client or a held-down Enter key shouldn't be able to run up the bill.
 * Fixed window per admin, in memory — plenty for one backend instance and a
 * handful of admins.
 */
const WINDOW_MS = 60_000;
const MAX_TURNS_PER_WINDOW = 20;

const windows = new Map<string, { startedAt: number; count: number }>();

export function chatRateLimit(req: Request, _res: Response, next: NextFunction): void {
  const userId = req.user!.id;
  const now = Date.now();
  const current = windows.get(userId);

  if (!current || now - current.startedAt >= WINDOW_MS) {
    windows.set(userId, { startedAt: now, count: 1 });
    next();
    return;
  }
  if (current.count >= MAX_TURNS_PER_WINDOW) {
    throw new ApiError(429, "Too many assistant messages — wait a minute and try again");
  }
  current.count += 1;
  next();
}
