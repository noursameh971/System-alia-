import { z } from "zod";
import { CATEGORY_LABELS, PAYMENT_LABELS } from "../../expenses/expenses.io.service.js";
import { createExpenseSchema, EXPENSE_PAYMENT_METHODS } from "../../expenses/expenses.schema.js";
import { createSupplierBillSchema } from "../../ledger/ledger.schema.js";
import { listLedgerEntities, type LedgerEntityWithBalance } from "../../ledger/ledger.service.js";
import { createRevenueSchema, type RevenueCategory } from "../../revenues/revenues.schema.js";
import { createProposedAction, type ActionKind } from "../actions.service.js";
import type { AttachmentRow } from "../attachments.service.js";
import type { ReceiptExtraction } from "../receiptReader.js";
import { verifyExpense, verifyRevenue, verifySupplierBill } from "../verify.js";
import { brandCodeField, formatEgp, resolveBrand, toolJson, ToolInputError, type BrandRef, type ToolContext } from "./context.js";
import { defineTool, type ToolCall } from "./defineTool.js";

/**
 * Write tools — in name only. Each validates a draft against the same Zod
 * schema the Finance page's own create endpoint uses, then stores it as a
 * proposed action. Nothing touches expenses/revenues/the ledger until the
 * admin confirms the card (POST /api/assistant/actions/:id/confirm).
 */

/**
 * The admin must have said these; the model may never fill them in. A
 * draft that declares one of them assumed is refused, and the refusal tells
 * the model to ask — the structural backstop behind the system prompt's
 * "ask, don't guess" rule. (A model that guesses without declaring it is
 * caught by the admin on the card, which shows exactly what will be saved.)
 */
const MUST_COME_FROM_ADMIN = {
  propose_expense: ["amount", "title", "category"],
  propose_revenue: ["amount", "source", "category"],
  propose_supplier_bill: ["amount"],
} as const satisfies Record<ActionKind, readonly string[]>;

/** The rules for what counts as assumed are in the system prompt ("Ask before you draft"); repeating them in three schemas would cost tokens on every step. */
function assumedFieldsSchema(fields: readonly [string, ...string[]]) {
  // Optional: a model that leaves it out shouldn't have the whole call
  // rejected by the provider's schema check (observed with gpt-oss-20b). The
  // server still marks an omitted payment method as assumed on its own.
  return z
    .array(z.enum(fields))
    .default([])
    .describe("Fields you filled in yourself, not from the admin's words or an attached receipt. Empty = nothing assumed.");
}

function assertNothingCriticalAssumed(toolName: ActionKind, assumed: readonly string[]): void {
  const critical = assumed.filter((field) => (MUST_COME_FROM_ADMIN[toolName] as readonly string[]).includes(field));
  if (critical.length > 0) {
    // Two cases reach here, and the model must tell them apart: it really
    // guessed (ask the admin), or it was over-cautious about something the
    // admin's words already give (call again). Models observed doing the
    // second would otherwise ask the admin for what they just said.
    throw new ToolInputError(
      `Not drafted: you marked ${critical.join(", ")} as assumed, and those must come from the admin or an attached ` +
        `receipt. If the admin's own words or the receipt state or clearly imply them, they are not assumed — e.g. "for ` +
        `the lawyer" gives title "Lawyer fees" and category professional_fees; "a sale for client Ahmed" gives source ` +
        `"Ahmed" and category product_sales — so call the tool again without them in assumedFields. Only if neither ` +
        `gives them, ask the admin (together with anything else missing) in one message.`,
    );
  }
}

const REVENUE_CATEGORY_LABELS: Record<RevenueCategory, string> = {
  product_sales: "Product Sales",
  wholesale: "Wholesale",
  shipping_income: "Shipping Income",
  other: "Other Income",
};

const attachmentIdField = z.string().trim().optional().describe("The attached receipt this is drafted from; saved as its receipt.");

function resolveAttachment(ctx: ToolContext, attachmentId: string | undefined): AttachmentRow | null {
  if (!attachmentId) return null;
  const attachment = ctx.attachments.get(attachmentId);
  if (!attachment) {
    const known = [...ctx.attachments.keys()];
    throw new ToolInputError(
      known.length > 0
        ? `No attachment "${attachmentId}" in this conversation. Attached files: ${known.join(", ")}.`
        : "There are no attached files in this conversation — leave attachmentId out.",
    );
  }
  return attachment;
}

/** A ledgerEntityId the model passed, checked now — so a wrong id is a correction the model makes, not a failed Confirm. */
async function resolvePayable(brand: BrandRef, ledgerEntityId: string): Promise<LedgerEntityWithBalance> {
  const entity = (await listLedgerEntities(brand.id)).find((candidate) => candidate.id === ledgerEntityId);
  if (!entity) {
    throw new ToolInputError(`No ledger entity ${ledgerEntityId} in workspace ${brand.code} — look it up with the ledger tool (view=balances).`);
  }
  if (entity.balanceType !== "payable") {
    throw new ToolInputError(
      `"${entity.name}" is a receivable (they owe us), so this can't be recorded against what we owe them. Leave ledgerEntityId out, or ask the admin.`,
    );
  }
  return entity;
}

async function propose(
  ctx: ToolContext,
  toolName: ActionKind,
  call: ToolCall,
  draft: {
    brandId: string;
    payload: Record<string, unknown>;
    assumedFields: string[];
    attachment: AttachmentRow | null;
    shownOnCard: Record<string, string>;
    /** From verify.ts — shown on the card and returned to the model to mention. */
    warnings: string[];
  },
): Promise<string> {
  assertNothingCriticalAssumed(toolName, draft.assumedFields);
  const action = await createProposedAction({
    conversationId: ctx.conversationId,
    toolName,
    toolUseId: call.id,
    brandId: draft.brandId,
    payload: draft.payload,
    assumedFields: [...new Set(draft.assumedFields)],
    attachmentId: draft.attachment?.id ?? null,
    // One string, a warning per line: display is a flat string map.
    display: draft.warnings.length > 0 ? { ...draft.shownOnCard, warnings: draft.warnings.join("\n") } : draft.shownOnCard,
    proposedBy: ctx.userId,
  });
  ctx.proposedActionIds.push(action.id);
  ctx.onActionProposed?.(action);
  return toolJson({
    actionId: action.id,
    status: "awaiting_admin_confirmation",
    // Models have misquoted amounts in their own words (3000 → "300 000");
    // the card shows these exact values, so the reply should too.
    shownOnCard: draft.shownOnCard,
    ...(draft.warnings.length > 0 ? { checks: draft.warnings } : { checks: "no problems found" }),
    note:
      "Not saved yet. The admin sees a confirmation card and must press Confirm. Describe the draft using the shownOnCard values exactly as written" +
      (draft.warnings.length > 0 ? ", and tell the admin about each of the checks (they're also on the card)." : "."),
  });
}

export function buildProposeTools(ctx: ToolContext) {
  const proposeExpense = defineTool({
    name: "propose_expense",
    description:
      "Draft an operating expense (money we paid) for the admin to confirm — not saved until they do. Never for COGS " +
      "or per-order shipping. Paying a payable ledger supplier? Pass its ledgerEntityId so their balance drops too.",
    inputSchema: createExpenseSchema
      .omit({ brandId: true, receiptUrl: true })
      .extend({
        brand: brandCodeField,
        amount: z.coerce.number().positive("Amount must be greater than 0").max(99_999_999),
        title: z.string().trim().min(1).max(200).describe("e.g. \"Lawyer fees\""),
        expenseDate: z.string().describe("YYYY-MM-DD"),
        notes: z.string().trim().max(2000).optional(),
        // No default here (the service schema defaults to cash): the run
        // function needs to see that it was left out, to mark it assumed.
        paymentMethod: z.enum(EXPENSE_PAYMENT_METHODS).optional().describe("Omit if not stated"),
        attachmentId: attachmentIdField,
        assumedFields: assumedFieldsSchema(["amount", "title", "category", "paymentMethod", "expenseDate"]),
      }),
    run: async ({ brand: brandCode, assumedFields, attachmentId, ...draft }, call) => {
      const brand = resolveBrand(ctx, brandCode);
      const attachment = resolveAttachment(ctx, attachmentId);
      const supplier = draft.ledgerEntityId ? await resolvePayable(brand, draft.ledgerEntityId) : null;
      // A receipt that says how it was paid (an InstaPay screenshot says so
      // in its header) settles it, whether or not the model passed it on —
      // models have dropped it and let the draft fall back to cash.
      const paymentMethod = draft.paymentMethod ?? (attachment?.extraction as ReceiptExtraction | null)?.paymentMethod ?? undefined;
      // Re-validated against the service's own schema (YYYY-MM-DD check,
      // amount bounds, defaults) — the source of truth, not the tool's copy.
      const payload = createExpenseSchema.parse({ ...draft, paymentMethod, brandId: brand.id, receiptUrl: attachment?.fileUrl });
      // paymentMethod has a schema default: leaving it out is assuming it.
      // Taken from the receipt, it's stated, even if the model listed it.
      const assumed =
        paymentMethod === undefined
          ? [...assumedFields, "paymentMethod"]
          : draft.paymentMethod === undefined
            ? assumedFields.filter((field) => field !== "paymentMethod")
            : assumedFields;
      const warnings = await verifyExpense({
        brandId: brand.id,
        amount: payload.amount,
        expenseDate: payload.expenseDate,
        category: payload.category,
        title: payload.title,
        supplier,
      });
      return propose(ctx, "propose_expense", call, {
        brandId: brand.id,
        payload,
        assumedFields: assumed,
        attachment,
        warnings,
        shownOnCard: {
          amount: formatEgp(payload.amount),
          title: payload.title,
          category: CATEGORY_LABELS[payload.category],
          paymentMethod: PAYMENT_LABELS[payload.paymentMethod],
          date: payload.expenseDate,
          workspace: brand.name,
          ...(supplier
            ? {
                supplier: supplier.name,
                supplierBalanceAfter: formatEgp(supplier.remainingBalance - payload.amount),
              }
            : {}),
          ...(attachment ? { receipt: "attached" } : {}),
        },
      });
    },
  });

  const proposeRevenue = defineTool({
    name: "propose_revenue",
    description:
      "Draft recorded revenue (a sale or income that isn't an Order, e.g. a client's transfer) for the admin to " +
      "confirm — not saved until they do. Doesn't move stock.",
    inputSchema: createRevenueSchema.omit({ brandId: true, receiptUrl: true }).extend({
      brand: brandCodeField,
      amount: z.coerce.number().positive("Amount must be greater than 0").max(99_999_999),
      source: z.string().trim().min(1).max(200).describe("Who it came from"),
      revenueDate: z.string().describe("YYYY-MM-DD"),
      notes: z.string().trim().max(2000).optional(),
      attachmentId: attachmentIdField,
      assumedFields: assumedFieldsSchema(["amount", "source", "category", "revenueDate"]),
    }),
    run: async ({ brand: brandCode, assumedFields, attachmentId, ...draft }, call) => {
      const brand = resolveBrand(ctx, brandCode);
      const attachment = resolveAttachment(ctx, attachmentId);
      const payload = createRevenueSchema.parse({ ...draft, brandId: brand.id, receiptUrl: attachment?.fileUrl });
      const warnings = await verifyRevenue({ brandId: brand.id, amount: payload.amount, revenueDate: payload.revenueDate, source: payload.source });
      return propose(ctx, "propose_revenue", call, {
        brandId: brand.id,
        payload,
        assumedFields,
        attachment,
        warnings,
        shownOnCard: {
          amount: formatEgp(payload.amount),
          source: payload.source,
          category: REVENUE_CATEGORY_LABELS[payload.category],
          date: payload.revenueDate,
          workspace: brand.name,
          ...(attachment ? { receipt: "attached" } : {}),
        },
      });
    },
  });

  const proposeSupplierBill = defineTool({
    name: "propose_supplier_bill",
    description:
      "Draft an UNPAID bill/invoice from a payable ledger supplier (e.g. آجل, on credit) for the admin to confirm. It " +
      "adds to what we owe them — not a payment, not an expense. A paid invoice is propose_expense with ledgerEntityId.",
    inputSchema: z.object({
      brand: brandCodeField,
      ledgerEntityId: z.string().trim().describe("From the ledger tool, search_knowledge or an attachment's matches"),
      amount: z.coerce.number().positive("Amount must be greater than 0").max(99_999_999),
      transactionDate: z.string().describe("Invoice date, YYYY-MM-DD"),
      dueDate: z.string().optional().describe("YYYY-MM-DD, only if given"),
      notes: z.string().trim().max(2000).optional().describe("e.g. \"Invoice 1187 — printed boxes\""),
      attachmentId: attachmentIdField,
      assumedFields: assumedFieldsSchema(["amount", "transactionDate", "dueDate"]),
    }),
    run: async ({ brand: brandCode, assumedFields, attachmentId, ...draft }, call) => {
      const brand = resolveBrand(ctx, brandCode);
      const attachment = resolveAttachment(ctx, attachmentId);
      const supplier = await resolvePayable(brand, draft.ledgerEntityId);
      const payload = createSupplierBillSchema.parse({ ...draft, brandId: brand.id, receiptUrl: attachment?.fileUrl });
      const warnings = await verifySupplierBill({
        ledgerEntityId: supplier.id,
        supplierName: supplier.name,
        amount: payload.amount,
        transactionDate: payload.transactionDate,
        dueDate: payload.dueDate,
      });
      return propose(ctx, "propose_supplier_bill", call, {
        brandId: brand.id,
        payload,
        assumedFields,
        attachment,
        warnings,
        shownOnCard: {
          supplier: supplier.name,
          amount: formatEgp(payload.amount),
          date: payload.transactionDate,
          ...(payload.dueDate ? { dueDate: payload.dueDate } : {}),
          supplierBalanceAfter: formatEgp(supplier.remainingBalance + payload.amount),
          workspace: brand.name,
          ...(attachment ? { receipt: "attached" } : {}),
        },
      });
    },
  });

  return [proposeExpense, proposeRevenue, proposeSupplierBill];
}
