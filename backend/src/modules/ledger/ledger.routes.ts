import { Router } from "express";
import { requireAuth, requireBrandAccess, requireRole } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  cashFlowSummaryHandler,
  createOpeningBalanceHandler,
  exportLedgerHandler,
  listLedgerEntitiesHandler,
  recordPaymentHandler,
} from "./ledger.controller.js";
import { createOpeningBalanceSchema, recordPaymentSchema } from "./ledger.schema.js";

export const ledgerRouter = Router();

/**
 * Same access rule as /api/expenses: admin-only across the board. Supplier
 * debt and cash position are exactly the numbers warehouse staff shouldn't
 * see, and importing the Excel ledger is bulk financial data entry.
 * (Bulk import itself rides on /api/expenses/import — see
 * expenses.io.service.ts's combined importer — so there's no separate
 * /api/ledger/import route.)
 */

// Registered before "/:id" so the literal "summary"/"export" segments aren't swallowed as an id.
ledgerRouter.get(
  "/summary",
  requireAuth,
  requireRole("admin"),
  requireBrandAccess("query"),
  asyncHandler(cashFlowSummaryHandler),
);

ledgerRouter.get(
  "/export",
  requireAuth,
  requireRole("admin"),
  requireBrandAccess("query"),
  asyncHandler(exportLedgerHandler),
);

ledgerRouter.get(
  "/entities",
  requireAuth,
  requireRole("admin"),
  requireBrandAccess("query"),
  asyncHandler(listLedgerEntitiesHandler),
);

ledgerRouter.post(
  "/opening-balance",
  requireAuth,
  requireRole("admin"),
  requireBrandAccess("body"),
  validateBody(createOpeningBalanceSchema),
  asyncHandler(createOpeningBalanceHandler),
);

// Carries no brandId — the handler resolves the entity's own brand and enforces access there. See assertBrandAccessForEntity.
ledgerRouter.post(
  "/entities/:id/payments",
  requireAuth,
  requireRole("admin"),
  validateBody(recordPaymentSchema),
  asyncHandler(recordPaymentHandler),
);
