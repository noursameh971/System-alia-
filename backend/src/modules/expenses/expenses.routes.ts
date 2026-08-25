import { Router } from "express";
import { requireAuth, requireBrandAccess, requireRole } from "../../middleware/auth.js";
import { rawBody } from "../../middleware/rawBody.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  createExpenseHandler,
  deleteExpenseHandler,
  exportExpensesHandler,
  financeSummaryHandler,
  importExpensesHandler,
  listExpensesHandler,
  updateExpenseHandler,
} from "./expenses.controller.js";
import { createExpenseSchema, updateExpenseSchema } from "./expenses.schema.js";

// Raw bytes for the .xlsx upload — see middleware/rawBody.ts.
const rawXlsxBody = rawBody("15mb");

export const expensesRouter = Router();

/**
 * Finance is restricted to the admin and finance roles across the board.
 * Cost, margin, and payroll are exactly the numbers warehouse staff
 * shouldn't see — the same reasoning that gates production cost on the
 * Products page. requireBrandAccess still applies to both roles, so a
 * finance user (brand-scoped, like warehouse_staff) can only reach their
 * own workspace's data.
 */

// Registered before "/:id" so the literal segments aren't swallowed as an id.
expensesRouter.get(
  "/summary",
  requireAuth,
  requireRole("admin", "finance"),
  requireBrandAccess("query"),
  asyncHandler(financeSummaryHandler),
);

expensesRouter.get(
  "/export",
  requireAuth,
  requireRole("admin", "finance"),
  requireBrandAccess("query"),
  asyncHandler(exportExpensesHandler),
);

expensesRouter.post(
  "/import",
  requireAuth,
  requireRole("admin", "finance"),
  requireBrandAccess("query"),
  rawXlsxBody,
  asyncHandler(importExpensesHandler),
);

expensesRouter.get("/", requireAuth, requireRole("admin", "finance"), requireBrandAccess("query"), asyncHandler(listExpensesHandler));

expensesRouter.post(
  "/",
  requireAuth,
  requireRole("admin", "finance"),
  requireBrandAccess("body"),
  validateBody(createExpenseSchema),
  asyncHandler(createExpenseHandler),
);

// PATCH/DELETE carry no brandId, so the handler resolves the row's own brand
// and enforces access there — see assertBrandAccessForExpense.
expensesRouter.patch(
  "/:id",
  requireAuth,
  requireRole("admin", "finance"),
  validateBody(updateExpenseSchema),
  asyncHandler(updateExpenseHandler),
);

expensesRouter.delete("/:id", requireAuth, requireRole("admin", "finance"), asyncHandler(deleteExpenseHandler));
