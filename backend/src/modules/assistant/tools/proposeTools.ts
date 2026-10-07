import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { BetaToolRunContext } from "@anthropic-ai/sdk/lib/tools/BetaRunnableTool";
import { z } from "zod";
import { createExpenseSchema } from "../../expenses/expenses.schema.js";
import { createRevenueSchema } from "../../revenues/revenues.schema.js";
import { createProposedAction, type ActionKind } from "../actions.service.js";
import { brandCodeField, resolveBrand, toolJson, type ToolContext } from "./context.js";

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

async function propose(
  ctx: ToolContext,
  toolName: ActionKind,
  context: BetaToolRunContext | undefined,
  brandId: string,
  payload: Record<string, unknown>,
): Promise<string> {
  const action = await createProposedAction({
    conversationId: ctx.conversationId,
    toolName,
    toolUseId: toolUseIdOf(context),
    brandId,
    payload,
    proposedBy: ctx.userId,
  });
  ctx.proposedActionIds.push(action.id);
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
      "paid money for the business. Not for COGS or per-order customer shipping — those are derived from orders. " +
      "If the expense pays down a known supplier's balance, call find_ledger_entities first and pass its ledgerEntityId.",
    inputSchema: createExpenseSchema
      .omit({ brandId: true, receiptUrl: true })
      .extend({
        brand: brandCodeField,
        title: z.string().trim().min(1).max(200).describe("Short description, e.g. \"Lawyer fees\"."),
        expenseDate: z.string().describe("YYYY-MM-DD. Today's date when the admin doesn't say."),
        notes: z.string().trim().max(2000).optional(),
      }),
    run: async ({ brand: brandCode, ...draft }, context) => {
      const brand = resolveBrand(ctx, brandCode);
      // Re-validated against the service's own schema (YYYY-MM-DD check,
      // amount bounds, defaults) — the source of truth, not the tool's copy.
      const payload = createExpenseSchema.parse({ ...draft, brandId: brand.id });
      return propose(ctx, "propose_expense", context, brand.id, payload);
    },
  });

  const proposeRevenue = betaZodTool({
    name: "propose_revenue",
    description:
      "Draft hand-recorded revenue for the admin to confirm. Does NOT save it. Use for a sale or income that is not " +
      "an Order in the system — e.g. \"record a sale for client X worth 5000\": source is the client, category " +
      "product_sales (wholesale for bulk/B2B sales). Does not move stock.",
    inputSchema: createRevenueSchema.omit({ brandId: true }).extend({
      brand: brandCodeField,
      source: z.string().trim().min(1).max(200).describe("Who or what the money came from, e.g. the client's name."),
      revenueDate: z.string().describe("YYYY-MM-DD. Today's date when the admin doesn't say."),
      notes: z.string().trim().max(2000).optional(),
    }),
    run: async ({ brand: brandCode, ...draft }, context) => {
      const brand = resolveBrand(ctx, brandCode);
      const payload = createRevenueSchema.parse({ ...draft, brandId: brand.id });
      return propose(ctx, "propose_revenue", context, brand.id, payload);
    },
  });

  return [proposeExpense, proposeRevenue];
}
