/**
 * Excel export/import for the Suppliers & Debts Ledger. Import goes through
 * createOpeningBalance (the same entry point the Opening Balances modal
 * uses), so a bulk-imported supplier gets the exact same get-or-create /
 * conflict-on-direction-mismatch guard a manually typed one would.
 */
import xlsx from "xlsx";
import { ApiError } from "../../utils/apiError.js";
import { createOpeningBalance, listLedgerEntities } from "./ledger.service.js";
import { LEDGER_BALANCE_TYPES, LEDGER_ENTITY_CATEGORIES, type LedgerBalanceType, type LedgerEntityCategory } from "./ledger.schema.js";

const EXPORT_HEADERS = [
  "Entity/Supplier Name",
  "Category",
  "Type",
  "Total Billed",
  "Amount Paid",
  "Remaining Balance",
  "Notes",
] as const;

/** Human-readable labels — what someone actually types in a spreadsheet. Export writes them, import accepts either these or the raw enum value, so a round-tripped export re-imports unchanged. */
const CATEGORY_LABELS: Record<LedgerEntityCategory, string> = {
  fabric: "Fabric",
  stitching: "Stitching",
  packaging: "Packaging",
  courier: "Courier",
  other: "Other",
};

const BALANCE_TYPE_LABELS: Record<LedgerBalanceType, string> = {
  payable: "Payable",
  receivable: "Receivable",
};

function normalize(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/[\s_&/-]+/g, "");
}

const CATEGORY_LOOKUP = new Map<string, LedgerEntityCategory>();
for (const category of LEDGER_ENTITY_CATEGORIES) {
  CATEGORY_LOOKUP.set(normalize(category), category);
  CATEGORY_LOOKUP.set(normalize(CATEGORY_LABELS[category]), category);
}

const BALANCE_TYPE_LOOKUP = new Map<string, LedgerBalanceType>();
for (const type of LEDGER_BALANCE_TYPES) {
  BALANCE_TYPE_LOOKUP.set(normalize(type), type);
  BALANCE_TYPE_LOOKUP.set(normalize(BALANCE_TYPE_LABELS[type]), type);
}
// "Payable"/"Receivable" read naturally in a spreadsheet, but so do these —
// accept them too rather than rejecting a well-meaning row over wording.
BALANCE_TYPE_LOOKUP.set(normalize("We owe them"), "payable");
BALANCE_TYPE_LOOKUP.set(normalize("They owe us"), "receivable");

export async function exportLedgerWorkbook(brandId: string): Promise<Buffer> {
  const entities = await listLedgerEntities(brandId);

  const rows = entities.map((entity) => ({
    "Entity/Supplier Name": entity.name,
    Category: CATEGORY_LABELS[entity.category],
    Type: BALANCE_TYPE_LABELS[entity.balanceType],
    "Total Billed": entity.totalBilled,
    "Amount Paid": entity.amountPaid,
    "Remaining Balance": entity.remainingBalance,
    Notes: entity.notes ?? "",
  }));

  const sheet = xlsx.utils.json_to_sheet(rows, { header: [...EXPORT_HEADERS] });
  sheet["!cols"] = [{ wch: 28 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 34 }];

  const book = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(book, sheet, "Ledger");
  return xlsx.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export interface ImportSectionResult {
  created: number;
  skipped: number;
  errors: string[];
}

function toAmount(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value ?? "").replace(/[^\d.-]/g, "");
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

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

const MAX_IMPORT_ROWS = 5000;

/**
 * Row-processor only — the caller (expenses.io.service.ts's combined
 * importer) is the one that reads the workbook and locates the "Ledger"
 * sheet, so this function can be driven directly from a test without an
 * .xlsx file, the same separation products.io.service.ts uses.
 *
 * Every row becomes an opening_balance transaction — "Total Billed" and
 * "Amount Paid" columns in an export are running totals, not something a
 * re-import should try to reconstruct as separate charge/payment rows, so
 * only "Remaining Balance" (falling back to "Total Billed" for a plain
 * opening-balances sheet that never had payments) is imported as the
 * balance to carry forward.
 */
export async function importLedgerRows(
  rows: Record<string, unknown>[],
  brandId: string,
  actorUserId: string,
): Promise<ImportSectionResult> {
  if (rows.length > MAX_IMPORT_ROWS) {
    throw ApiError.badRequest(`The Ledger sheet has ${rows.length} rows — please split it into batches of ${MAX_IMPORT_ROWS}`);
  }

  const result: ImportSectionResult = { created: 0, skipped: 0, errors: [] };

  for (const [index, row] of rows.entries()) {
    // +2: one for the header row, one because spreadsheet rows are 1-indexed.
    const rowNumber = index + 2;

    const name = String(row["Entity/Supplier Name"] ?? row["Entity Name"] ?? row["Supplier Name"] ?? row.name ?? "").trim();
    const categoryRaw = row.Category ?? row.category ?? "";
    const typeRaw = row.Type ?? row["Balance Type"] ?? row.balanceType ?? "";
    const dueDateRaw = row["Due Date"] ?? row.dueDate ?? "";
    const notesRaw = row.Notes ?? row.notes ?? "";

    const amountRaw =
      row["Remaining Balance"] !== undefined && row["Remaining Balance"] !== ""
        ? row["Remaining Balance"]
        : (row["Total Billed"] ?? row.Amount ?? row.amount ?? "");

    if (!name && !categoryRaw && !typeRaw && !amountRaw) {
      result.skipped += 1; // a trailing all-blank row — not a user error
      continue;
    }

    if (!name) {
      result.errors.push(`Row ${rowNumber}: Entity/Supplier Name is required`);
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

    const balanceType = BALANCE_TYPE_LOOKUP.get(normalize(typeRaw));
    if (!balanceType) {
      result.errors.push(`Row ${rowNumber}: Type must be "Payable" or "Receivable"`);
      result.skipped += 1;
      continue;
    }

    const amount = toAmount(amountRaw);
    if (amount == null || amount === 0) {
      result.skipped += 1; // a fully-settled historical row (remaining 0) — nothing to carry forward, not an error
      continue;
    }
    if (amount < 0) {
      result.errors.push(`Row ${rowNumber}: Amount can't be negative`);
      result.skipped += 1;
      continue;
    }

    const dueDate = dueDateRaw ? toDateOnly(dueDateRaw) : null;

    try {
      await createOpeningBalance(
        {
          brandId,
          entityName: name.slice(0, 200),
          category,
          balanceType,
          amount,
          dueDate: dueDate ?? undefined,
          notes: String(notesRaw).trim().slice(0, 2000),
        },
        actorUserId,
      );
      result.created += 1;
    } catch (err) {
      // A direction conflict (ApiError.conflict from getOrCreateEntity) is
      // the one createOpeningBalance error that's a row-data problem, not a
      // server fault — report it inline and keep processing the rest.
      if (err instanceof ApiError) {
        result.errors.push(`Row ${rowNumber}: ${err.message}`);
        result.skipped += 1;
        continue;
      }
      throw err;
    }
  }

  return result;
}
