import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { rawBody } from "../../middleware/rawBody.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { uploadReceiptHandler } from "./uploads.controller.js";

// Raw request body as a Buffer (the upload is file bytes, not JSON) — see middleware/rawBody.ts.
const rawReceiptBody = rawBody("8mb");

export const uploadsRouter = Router();

// Same roles as the expenses/ledger modules this feeds — a receipt is
// always attached from the Add Expense or Add Opening Balance modal, both
// admin/finance-only.
uploadsRouter.post("/receipts", requireAuth, requireRole("admin", "finance"), rawReceiptBody, asyncHandler(uploadReceiptHandler));
