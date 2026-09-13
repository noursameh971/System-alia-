import { Router } from "express";
import { requireAuth, requireBrandAccess, requireRole } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  cashFlowSummaryHandler,
  createChargeHandler,
  createOpeningBalanceHandler,
  deleteLedgerTransactionHandler,
  exportLedgerEntityHandler,
  exportLedgerHandler,
  getLedgerEntityHandler,
  listLedgerEntitiesHandler,
  recordPaymentHandler,
  updateLedgerEntityHandler,
  updateLedgerTransactionHandler,
} from "./ledger.controller.js";
import {
  createChargeSchema,
  createOpeningBalanceSchema,
  recordPaymentSchema,
  updateLedgerEntitySchema,
  updateLedgerTransactionSchema,
} from "./ledger.schema.js";

export const ledgerRouter = Router();

/**
 * Same access rule as /api/expenses: admin and finance roles only. Supplier
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
  requireRole("admin", "finance"),
  requireBrandAccess("query"),
  asyncHandler(cashFlowSummaryHandler),
);

ledgerRouter.get(
  "/export",
  requireAuth,
  requireRole("admin", "finance"),
  requireBrandAccess("query"),
  asyncHandler(exportLedgerHandler),
);

ledgerRouter.get(
  "/entities",
  requireAuth,
  requireRole("admin", "finance"),
  requireBrandAccess("query"),
  asyncHandler(listLedgerEntitiesHandler),
);

ledgerRouter.post(
  "/opening-balance",
  requireAuth,
  requireRole("admin", "finance"),
  requireBrandAccess("body"),
  validateBody(createOpeningBalanceSchema),
  asyncHandler(createOpeningBalanceHandler),
);

// Carries no brandId — the handler resolves the entity's own brand and enforces access there. See assertBrandAccessForEntity.
ledgerRouter.post(
  "/entities/:id/payments",
  requireAuth,
  requireRole("admin", "finance"),
  validateBody(recordPaymentSchema),
  asyncHandler(recordPaymentHandler),
);

// The Supplier Detail page's data source, plus its own edit/charge/export
// actions. Doesn't collide with the literal "/entities" list route above —
// Express matches "/entities" and "/entities/:id" as different path shapes.
ledgerRouter.get("/entities/:id", requireAuth, requireRole("admin", "finance"), asyncHandler(getLedgerEntityHandler));

ledgerRouter.patch(
  "/entities/:id",
  requireAuth,
  requireRole("admin", "finance"),
  validateBody(updateLedgerEntitySchema),
  asyncHandler(updateLedgerEntityHandler),
);

ledgerRouter.post(
  "/entities/:id/charges",
  requireAuth,
  requireRole("admin", "finance"),
  validateBody(createChargeSchema),
  asyncHandler(createChargeHandler),
);

ledgerRouter.get("/entities/:id/export", requireAuth, requireRole("admin", "finance"), asyncHandler(exportLedgerEntityHandler));

// Carries no brandId — the handler resolves the transaction's own brand and enforces access there. See assertBrandAccessForTransaction.
ledgerRouter.patch(
  "/transactions/:id",
  requireAuth,
  requireRole("admin", "finance"),
  validateBody(updateLedgerTransactionSchema),
  asyncHandler(updateLedgerTransactionHandler),
);

ledgerRouter.delete("/transactions/:id", requireAuth, requireRole("admin", "finance"), asyncHandler(deleteLedgerTransactionHandler));
