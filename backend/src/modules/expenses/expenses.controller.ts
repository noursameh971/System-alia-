import type { Request, Response } from "express";
import { ApiError } from "../../utils/apiError.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import {
  createExpense,
  deleteExpense,
  getExpenseBrandId,
  getFinanceSummary,
  listExpenses,
  updateExpense,
} from "./expenses.service.js";
import { exportExpensesWorkbook, importFinanceWorkbook } from "./expenses.io.service.js";
import {
  financeSummaryQuerySchema,
  listExpensesQuerySchema,
  type CreateExpenseInput,
  type UpdateExpenseInput,
} from "./expenses.schema.js";

/**
 * :id routes carry no brandId, so requireBrandAccess can't run on them —
 * this resolves the row's own brand and enforces the same rule by hand.
 * Admins pass through, exactly as that middleware does.
 */
async function assertBrandAccessForExpense(req: Request, expenseId: string): Promise<void> {
  if (req.user!.role === "admin") return;
  const brandId = await getExpenseBrandId(expenseId);
  if (brandId !== req.user!.brandId) {
    throw ApiError.forbidden("You don't have access to that brand's data");
  }
}

export async function listExpensesHandler(req: Request, res: Response): Promise<void> {
  const parsed = listExpensesQuerySchema.safeParse(req.query);
  if (!parsed.success) throw ApiError.badRequest("Invalid query parameters", parsed.error.flatten());
  sendSuccess(res, 200, await listExpenses(parsed.data));
}

export async function createExpenseHandler(req: Request, res: Response): Promise<void> {
  const input = req.body as CreateExpenseInput;
  sendSuccess(res, 201, await createExpense(input, req.user!.id));
}

export async function updateExpenseHandler(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id ?? "");
  await assertBrandAccessForExpense(req, id);
  sendSuccess(res, 200, await updateExpense(id, req.body as UpdateExpenseInput));
}

export async function deleteExpenseHandler(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id ?? "");
  await assertBrandAccessForExpense(req, id);
  await deleteExpense(id);
  sendSuccess(res, 200, { deleted: true });
}

/** GET /api/expenses/summary?brandId= — the Finance page's KPI cards and monthly breakdown chart. */
export async function financeSummaryHandler(req: Request, res: Response): Promise<void> {
  const parsed = financeSummaryQuerySchema.safeParse(req.query);
  if (!parsed.success) throw ApiError.badRequest("Invalid query parameters", parsed.error.flatten());
  sendSuccess(res, 200, await getFinanceSummary(parsed.data.brandId));
}

export async function exportExpensesHandler(req: Request, res: Response): Promise<void> {
  const brandId = String(req.query.brandId ?? "");
  if (!brandId) throw ApiError.badRequest("brandId query parameter is required");

  const buffer = await exportExpensesWorkbook(brandId);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="expenses-export.xlsx"');
  res.send(buffer);
}

/**
 * POST /api/expenses/import?brandId= — raw .xlsx bytes, same upload shape as
 * the products importer. Drives both the Expenses and Suppliers & Debts
 * Ledger importers off whichever sheets the workbook actually has — see
 * expenses.io.service.ts's importFinanceWorkbook for the sheet-detection rules.
 */
export async function importExpensesHandler(req: Request, res: Response): Promise<void> {
  const brandId = String(req.query.brandId ?? "");
  if (!brandId) throw ApiError.badRequest("brandId query parameter is required");
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    throw ApiError.badRequest("Request body must be the raw .xlsx file bytes");
  }

  sendSuccess(res, 200, await importFinanceWorkbook(req.body, brandId, req.user!.id));
}
