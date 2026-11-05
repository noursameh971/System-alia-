import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth, requireBrandAccess, requireRole } from "../../middleware/auth.js";
import { ApiError } from "../../utils/apiError.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { getFinancialStatements } from "./statements.service.js";

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date")
  .refine((value) => !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()), "Not a real date");

const statementsQuerySchema = z.object({
  brandId: z.string().uuid(),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
});

export const statementsRouter = Router();

/**
 * GET /api/statements?brandId=&from=&to= — the Finance page's Income
 * Statement, Cash Flow, and Balance Sheet tabs. Read-only; same access rule
 * as /api/expenses/summary (admin and finance, brand-scoped).
 */
statementsRouter.get(
  "/",
  requireAuth,
  requireRole("admin", "finance"),
  requireBrandAccess("query"),
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = statementsQuerySchema.safeParse(req.query);
    if (!parsed.success) throw ApiError.badRequest("Invalid query parameters", parsed.error.flatten());
    const { brandId, from, to } = parsed.data;
    sendSuccess(res, 200, await getFinancialStatements(brandId, { from, to }));
  }),
);
