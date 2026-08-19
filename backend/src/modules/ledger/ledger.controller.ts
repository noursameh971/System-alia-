import type { Request, Response } from "express";
import { ApiError } from "../../utils/apiError.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { createOpeningBalance, getCashFlowSummary, getEntityBrandId, listLedgerEntities, recordPayment } from "./ledger.service.js";
import { exportLedgerWorkbook } from "./ledger.io.service.js";
import {
  cashFlowSummaryQuerySchema,
  listLedgerEntitiesQuerySchema,
  type CreateOpeningBalanceInput,
  type RecordPaymentInput,
} from "./ledger.schema.js";

/** :id routes carry no brandId, so requireBrandAccess can't run on them — same pattern as expenses.controller's assertBrandAccessForExpense. */
async function assertBrandAccessForEntity(req: Request, entityId: string): Promise<void> {
  if (req.user!.role === "admin") return;
  const brandId = await getEntityBrandId(entityId);
  if (brandId !== req.user!.brandId) {
    throw ApiError.forbidden("You don't have access to that brand's data");
  }
}

export async function listLedgerEntitiesHandler(req: Request, res: Response): Promise<void> {
  const parsed = listLedgerEntitiesQuerySchema.safeParse(req.query);
  if (!parsed.success) throw ApiError.badRequest("Invalid query parameters", parsed.error.flatten());
  sendSuccess(res, 200, await listLedgerEntities(parsed.data.brandId));
}

/** GET /api/ledger/summary?brandId= — the Finance page's Accounts Payable / Accounts Receivable / Net Cash Flow cards. */
export async function cashFlowSummaryHandler(req: Request, res: Response): Promise<void> {
  const parsed = cashFlowSummaryQuerySchema.safeParse(req.query);
  if (!parsed.success) throw ApiError.badRequest("Invalid query parameters", parsed.error.flatten());
  sendSuccess(res, 200, await getCashFlowSummary(parsed.data.brandId));
}

export async function createOpeningBalanceHandler(req: Request, res: Response): Promise<void> {
  const input = req.body as CreateOpeningBalanceInput;
  sendSuccess(res, 201, await createOpeningBalance(input, req.user!.id));
}

export async function recordPaymentHandler(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id ?? "");
  await assertBrandAccessForEntity(req, id);
  sendSuccess(res, 200, await recordPayment(id, req.body as RecordPaymentInput, req.user!.id));
}

export async function exportLedgerHandler(req: Request, res: Response): Promise<void> {
  const brandId = String(req.query.brandId ?? "");
  if (!brandId) throw ApiError.badRequest("brandId query parameter is required");

  const buffer = await exportLedgerWorkbook(brandId);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="ledger-export.xlsx"');
  res.send(buffer);
}
