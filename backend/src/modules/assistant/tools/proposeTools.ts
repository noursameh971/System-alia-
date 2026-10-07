import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { BetaToolRunContext } from "@anthropic-ai/sdk/lib/tools/BetaRunnableTool";
import { z } from "zod";
import { createExpenseSchema, EXPENSE_PAYMENT_METHODS } from "../../expenses/expenses.schema.js";
import { createRevenueSchema } from "../../revenues/revenues.schema.js";
import { createProposedAction, type ActionKind } from "../actions.service.js";
import { brandCodeField, resolveBrand, toolJson, ToolInputError, type ToolContext } from "./context.js";

/**
 * Write tools — in name only. Each validates a draft against the same Zod
 * schema the Finance page's own create endpoint uses, then stores it as a
 * proposed action. Nothing touches expenses/revenues until the admin
 * confirms the card (POST /api/assistant/actions/:id/confirm).
 */

function toolUseIdOf(context: BetaToolRunContext | undefined): string | null {
  const block = context?.toolUseBlock;
  return block && "id" in block && typeof block.id === "string" ? block.id : null;
}

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
} as const satisfies Record<ActionKind, readonly string[]>;

function assumedFieldsSchema(fields: readonly [string, ...string[]]) {
  return z
    .array(z.enum(fields))
    .describe(
      "Every field you filled in yourself instead of taking from the admin's words (e.g. expenseDate when they " +
        "didn't give a date). A value clearly derived from what they said counts as stated, not assumed: \"10k\" " +
        "is amount 10000; \"for the lawyer\" gives the title and category professional_fees. The card highlights " +
        "assumed fields. Be honest: an empty list means the admin stated everything.",
    );
}

function assertNothingCriticalAssumed(toolName: ActionKind, assumed: readonly string[]): void {
  const critical = assumed.filter((field) => (MUST_COME_FROM_ADMIN[toolName] as readonly string[]).includes(field));
  if (critical.length > 0) {
    throw new ToolInputError(
      `Not drafted: ${critical.join(", ")} must come from the admin, not be assumed. Ask the admin for ` +
        `${critical.join(" and ")} (together with anything else still missing) in one message, then draft again.`,
    );
  }
}

async function propose(
  ctx: ToolContext,
  toolName: ActionKind,
  context: BetaToolRunContext | undefined,
  brandId: string,
  payload: Record<string, unknown>,
  assumedFields: string[],
): Promise<string> {
  assertNothingCriticalAssumed(toolName, assumedFields);
  const action = await createProposedAction({
    conversationId: ctx.conversationId,
    toolName,
    toolUseId: toolUseIdOf(context),
    brandId,
    payload,
    assumedFields: [...new Set(assumedFields)],
    proposedBy: ctx.userId,
  });
  ctx.proposedActionIds.push(action.id);
  ctx.onActionProposed?.(action);
  return toolJson({
    actionId: action.id,
    status: "awaiting_admin_confirmation",
    note: "Not saved yet. The admin sees a confirmation card and must press Confirm.",
  });
}

export function buildProposeTools(ctx: ToolContext) {
  const proposeExpense = betaZodTool({
    name: "propose_expense",
    description:
      "Draft an operating expense for the admin to confirm. Does NOT save it. Use when the admin says they spent or " +
      "paid money for the business. Only call once the admin has given the amount and what it was for, and the " +
      "category is clear from that — otherwise ask them first. Not for COGS or per-order customer shipping — those " +
      "are derived from orders. If the expense pays down a known supplier's balance, call find_ledger_entities " +
      "first and pass its ledgerEntityId.",
    inputSchema: createExpenseSchema
      .omit({ brandId: true, receiptUrl: true })
      .extend({
        brand: brandCodeField,
        title: z.string().trim().min(1).max(200).describe("Short description, e.g. \"Lawyer fees\"."),
        expenseDate: z.string().describe("YYYY-MM-DD. Today's date when the admin doesn't say."),
        notes: z.string().trim().max(2000).optional(),
        // No default here (the service schema defaults to cash): the run
        // function needs to see that it was left out, to mark it assumed.
        paymentMethod: z.enum(EXPENSE_PAYMENT_METHODS).optional().describe("Omit when the admin didn't say."),
        assumedFields: assumedFieldsSchema(["amount", "title", "category", "paymentMethod", "expenseDate"]),
      }),
    run: async ({ brand: brandCode, assumedFields, ...draft }, context) => {
      const brand = resolveBrand(ctx, brandCode);
      // Re-validated against the service's own schema (YYYY-MM-DD check,
      // amount bounds, defaults) — the source of truth, not the tool's copy.
      const payload = createExpenseSchema.parse({ ...draft, brandId: brand.id });
      // paymentMethod has a schema default: leaving it out is assuming it.
      const assumed = draft.paymentMethod === undefined ? [...assumedFields, "paymentMethod"] : assumedFields;
      return propose(ctx, "propose_expense", context, brand.id, payload, assumed);
    },
  });

  const proposeRevenue = betaZodTool({
    name: "propose_revenue",
    description:
      "Draft hand-recorded revenue for the admin to confirm. Does NOT save it. Use for a sale or income that is not " +
      "an Order in the system — e.g. \"record a sale for client X worth 5000\": source is the client, category " +
      "product_sales (wholesale for bulk/B2B sales). Only call once the admin has given the amount and who it came " +
      "from — otherwise ask them first. Does not move stock.",
    inputSchema: createRevenueSchema.omit({ brandId: true }).extend({
      brand: brandCodeField,
      source: z.string().trim().min(1).max(200).describe("Who or what the money came from, e.g. the client's name."),
      revenueDate: z.string().describe("YYYY-MM-DD. Today's date when the admin doesn't say."),
      notes: z.string().trim().max(2000).optional(),
      assumedFields: assumedFieldsSchema(["amount", "source", "category", "revenueDate"]),
    }),
    run: async ({ brand: brandCode, assumedFields, ...draft }, context) => {
      const brand = resolveBrand(ctx, brandCode);
      const payload = createRevenueSchema.parse({ ...draft, brandId: brand.id });
      return propose(ctx, "propose_revenue", context, brand.id, payload, assumedFields);
    },
  });

  return [proposeExpense, proposeRevenue];
}
