import type { Request, Response } from "express";
import { ApiError } from "../../utils/apiError.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import {
  createCharge,
  createOpeningBalance,
  deleteLedgerTransaction,
  getCashFlowSummary,
  getEntityBrandId,
  getLedgerEntityWithTransactions,
  getTransactionBrandId,
  listLedgerEntities,
  recordPayment,
  updateLedgerEntity,
  updateLedgerTransaction,
} from "./ledger.service.js";
import { exportLedgerEntityStatement, exportLedgerWorkbook } from "./ledger.io.service.js";
import {
  cashFlowSummaryQuerySchema,
  listLedgerEntitiesQuerySchema,
  type CreateChargeInput,
  type CreateOpeningBalanceInput,
  type RecordPaymentInput,
  type UpdateLedgerEntityInput,
  type UpdateLedgerTransactionInput,
} from "./ledger.schema.js";

/** :id routes carry no brandId, so requireBrandAccess can't run on them — same pattern as expenses.controller's assertBrandAccessForExpense. */
async function assertBrandAccessForEntity(req: Request, entityId: string): Promise<void> {
  if (req.user!.role === "admin") return;
  const brandId = await getEntityBrandId(entityId);
  if (brandId !== req.user!.brandId) {
    throw ApiError.forbidden("You don't have access to that brand's data");
  }
}

/** Same as assertBrandAccessForEntity, but for /transactions/:id routes, which carry a transaction id rather than an entity id. */
async function assertBrandAccessForTransaction(req: Request, transactionId: string): Promise<void> {
  if (req.user!.role === "admin") return;
  const brandId = await getTransactionBrandId(transactionId);
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

/** GET /api/ledger/entities/:id — the Supplier Detail page's main data source. */
export async function getLedgerEntityHandler(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id ?? "");
  await assertBrandAccessForEntity(req, id);
  sendSuccess(res, 200, await getLedgerEntityWithTransactions(id));
}

/** PATCH /api/ledger/entities/:id — "Edit Supplier Info". */
export async function updateLedgerEntityHandler(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id ?? "");
  await assertBrandAccessForEntity(req, id);
  sendSuccess(res, 200, await updateLedgerEntity(id, req.body as UpdateLedgerEntityInput));
}

/** POST /api/ledger/entities/:id/charges — "Add New Bill / Invoice". */
export async function createChargeHandler(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id ?? "");
  await assertBrandAccessForEntity(req, id);
  sendSuccess(res, 201, await createCharge(id, req.body as CreateChargeInput, req.user!.id));
}

/** GET /api/ledger/entities/:id/export — "Export Statement" on the Supplier Detail page. */
export async function exportLedgerEntityHandler(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id ?? "");
  await assertBrandAccessForEntity(req, id);

  const buffer = await exportLedgerEntityStatement(id);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="supplier-statement.xlsx"');
  res.send(buffer);
}

/** PATCH /api/ledger/transactions/:id — editing/adjusting one bill or payment row from the Supplier Detail page's history table. */
export async function updateLedgerTransactionHandler(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id ?? "");
  await assertBrandAccessForTransaction(req, id);
  sendSuccess(res, 200, await updateLedgerTransaction(id, req.body as UpdateLedgerTransactionInput));
}

/** DELETE /api/ledger/transactions/:id */
export async function deleteLedgerTransactionHandler(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id ?? "");
  await assertBrandAccessForTransaction(req, id);
  await deleteLedgerTransaction(id);
  sendSuccess(res, 200, { deleted: true });
}
