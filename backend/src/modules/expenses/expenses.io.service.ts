/**
 * Excel export/import for the Finance page's expense ledger. Import goes
 * through createExpense (the same entry point the Add Expense modal uses),
 * so it can't bypass validation or skip the created_by audit column.
 */
import xlsx from "xlsx";
import { ApiError } from "../../utils/apiError.js";
import { createExpense, listExpenses } from "./expenses.service.js";
import { importLedgerRows, type ImportSectionResult } from "../ledger/ledger.io.service.js";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_PAYMENT_METHODS,
  type ExpenseCategory,
  type ExpensePaymentMethod,
} from "./expenses.schema.js";

const EXPORT_HEADERS = ["Date", "Title", "Category", "Amount", "Currency", "Payment Method", "Receipt URL", "Notes"] as const;

/**
 * Human-readable labels are what an accountant actually types in a
 * spreadsheet, so export writes them and import accepts either these or the
 * raw enum value — a round-tripped export re-imports unchanged.
 */
const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  marketing: "Marketing & Ads",
  salaries: "Salaries",
  production: "Production & Fabric",
  packaging: "Packaging & Shipping",
  rent: "Rent & Utilities",
  misc: "Misc/Software",
};

const PAYMENT_LABELS: Record<ExpensePaymentMethod, string> = {
  cash: "Cash",
  bank_transfer: "Bank Transfer",
  card: "Card",
  instapay: "InstaPay",
  other: "Other",
};

function normalize(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/[\s_&/-]+/g, "");
}

const CATEGORY_LOOKUP = new Map<string, ExpenseCategory>();
for (const category of EXPENSE_CATEGORIES) {
  CATEGORY_LOOKUP.set(normalize(category), category);
  CATEGORY_LOOKUP.set(normalize(CATEGORY_LABELS[category]), category);
}

const PAYMENT_LOOKUP = new Map<string, ExpensePaymentMethod>();
for (const method of EXPENSE_PAYMENT_METHODS) {
  PAYMENT_LOOKUP.set(normalize(method), method);
  PAYMENT_LOOKUP.set(normalize(PAYMENT_LABELS[method]), method);
}

export async function exportExpensesWorkbook(brandId: string): Promise<Buffer> {
  const items = await listExpenses({ brandId });

  const rows = items.map((expense) => ({
    Date: expense.expenseDate,
    Title: expense.title,
    Category: CATEGORY_LABELS[expense.category],
    Amount: expense.amount,
    Currency: expense.currency,
    "Payment Method": PAYMENT_LABELS[expense.paymentMethod],
    "Receipt URL": expense.receiptUrl ?? "",
    Notes: expense.notes ?? "",
  }));

  const sheet = xlsx.utils.json_to_sheet(rows, { header: [...EXPORT_HEADERS] });
  // Explicit widths: without them every column collapses to ~8 characters
  // and the export opens looking broken.
  sheet["!cols"] = [{ wch: 12 }, { wch: 34 }, { wch: 20 }, { wch: 12 }, { wch: 9 }, { wch: 16 }, { wch: 30 }, { wch: 34 }];

  const book = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(book, sheet, "Expenses");
  return xlsx.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/**
 * Excel serial dates, JS Dates, and plain strings all show up in the same
 * column depending on how the sheet was authored — normalise all three to
 * YYYY-MM-DD rather than trusting the cell type.
 */
function toDateOnly(value: unknown): string | null {
  if (value == null || value === "") return null;

  if (value instanceof Date) return value.toISOString().slice(0, 10);

  if (typeof value === "number") {
    // Excel's epoch is 1899-12-30 (its leap-year bug means 1900-01-01 is serial 1).
    const parsed = new Date(Date.UTC(1899, 11, 30) + value * 86_400_000);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
  }

  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function toAmount(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  // Strip thousands separators and any currency symbol an accountant typed.
  const text = String(value ?? "").replace(/[^\d.-]/g, "");
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

const MAX_IMPORT_ROWS = 5000;

/** Row-processor only, mirroring ledger.io.service.ts's importLedgerRows — separated from workbook-reading so importFinanceWorkbook can drive both processors off sheets it located itself. */
async function importExpenseRowsData(
  rows: Record<string, unknown>[],
  brandId: string,
  actorUserId: string,
): Promise<ImportSectionResult> {
  if (rows.length > MAX_IMPORT_ROWS) {
    throw ApiError.badRequest(`The Expenses sheet has ${rows.length} rows — please split it into batches of ${MAX_IMPORT_ROWS}`);
  }

  const result: ImportSectionResult = { created: 0, skipped: 0, errors: [] };

  for (const [index, row] of rows.entries()) {
    // +2: one for the header row, one because spreadsheet rows are 1-indexed.
    const rowNumber = index + 2;

    const title = String(row.Title ?? row.title ?? "").trim();
    const categoryRaw = row.Category ?? row.category ?? "";
    const amountRaw = row.Amount ?? row.amount ?? "";
    const dateRaw = row.Date ?? row.date ?? "";
    const paymentRaw = row["Payment Method"] ?? row.paymentMethod ?? "";

    // A trailing all-blank row is what Excel leaves behind constantly; it's
    // not a user error, so skip it silently rather than reporting it.
    if (!title && !categoryRaw && !amountRaw && !dateRaw) {
      result.skipped += 1;
      continue;
    }

    if (!title) {
      result.errors.push(`Row ${rowNumber}: Title is required`);
      result.skipped += 1;
      continue;
    }

    const category = CATEGORY_LOOKUP.get(normalize(categoryRaw));
    if (!category) {
      result.errors.push(
        `Row ${rowNumber}: unknown category "${String(categoryRaw)}" — use one of ${Object.values(CATEGORY_LABELS).join(", ")}`,
      );
      result.skipped += 1;
      continue;
    }

    const amount = toAmount(amountRaw);
    if (amount == null || amount <= 0) {
      result.errors.push(`Row ${rowNumber}: Amount must be a number greater than 0`);
      result.skipped += 1;
      continue;
    }

    const expenseDate = toDateOnly(dateRaw);
    if (!expenseDate) {
      result.errors.push(`Row ${rowNumber}: couldn't read "${String(dateRaw)}" as a date`);
      result.skipped += 1;
      continue;
    }

    // Payment method is the one optional-ish field: an unrecognised value
    // falls back to "other" rather than rejecting an otherwise-valid expense.
    const paymentMethod = PAYMENT_LOOKUP.get(normalize(paymentRaw)) ?? "cash";

    await createExpense(
      {
        brandId,
        title: title.slice(0, 200),
        category,
        amount,
        paymentMethod,
        expenseDate,
        receiptUrl: String(row["Receipt URL"] ?? "").trim().slice(0, 2000),
        notes: String(row.Notes ?? row.notes ?? "").trim().slice(0, 2000),
      },
      actorUserId,
    );
    result.created += 1;
  }

  return result;
}

export interface ImportFinanceResult {
  /** null when the workbook had no sheet recognisable as expense rows. */
  expenses: ImportSectionResult | null;
  /** null when the workbook had no sheet named "Ledger". */
  ledger: ImportSectionResult | null;
}

function findSheetName(book: xlsx.WorkBook, target: string): string | null {
  return book.SheetNames.find((name) => name.trim().toLowerCase() === target) ?? null;
}

/**
 * The Finance page's single "Import Excel" entry point — reads one workbook
 * and drives up to two independent processors off it, so a bulk upload can
 * carry ordinary expenses, historical supplier balances, or both in one file:
 *
 * - a sheet named "Expenses" (case-insensitive) goes through
 *   importExpenseRowsData
 * - a sheet named "Ledger" goes through ledger.io.service's importLedgerRows
 *
 * Backward compatible with the original single-sheet importer: a workbook
 * with exactly one sheet and no "Ledger" sheet is treated as Expenses
 * regardless of that sheet's name, so files exported before Ledger existed
 * (or hand-built as "Sheet1") still import exactly as they did before.
 */
export async function importFinanceWorkbook(buffer: Buffer, brandId: string, actorUserId: string): Promise<ImportFinanceResult> {
  let book: xlsx.WorkBook;
  try {
    book = xlsx.read(buffer, { type: "buffer", cellDates: true });
  } catch {
    throw ApiError.badRequest("That file couldn't be read as an .xlsx workbook");
  }
  if (book.SheetNames.length === 0) throw ApiError.badRequest("The workbook has no sheets");

  const ledgerSheetName = findSheetName(book, "ledger");
  const expensesSheetName =
    findSheetName(book, "expenses") ?? (book.SheetNames.length === 1 && !ledgerSheetName ? book.SheetNames[0]! : null);

  if (!expensesSheetName && !ledgerSheetName) {
    throw ApiError.badRequest('Add a sheet named "Expenses" or "Ledger" (or both) — this workbook has neither.');
  }

  const expenses = expensesSheetName
    ? await importExpenseRowsData(
        xlsx.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[expensesSheetName]!, { defval: "" }),
        brandId,
        actorUserId,
      )
    : null;

  const ledger = ledgerSheetName
    ? await importLedgerRows(
        xlsx.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[ledgerSheetName]!, { defval: "" }),
        brandId,
        actorUserId,
      )
    : null;

  return { expenses, ledger };
}
