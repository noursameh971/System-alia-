import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, type DbTransaction } from "../../db/client.js";
import { aiActions, aiConversations } from "../../db/schema/index.js";
import { ApiError } from "../../utils/apiError.js";
import { createExpenseSchema } from "../expenses/expenses.schema.js";
import { createExpense } from "../expenses/expenses.service.js";
import { createSupplierBillSchema } from "../ledger/ledger.schema.js";
import { createSupplierBill } from "../ledger/ledger.service.js";
import { createRevenueSchema } from "../revenues/revenues.schema.js";
import { createRevenue } from "../revenues/revenues.service.js";

/**
 * The propose → confirm queue. The model can only *draft* a write (a
 * proposed ai_actions row holding an already-validated service input);
 * nothing reaches expenses/revenues/the ledger until the admin confirms the card,
 * which runs the same service the Finance page's own forms use.
 *
 * Every write the assistant can make is listed here, and only here — a
 * tool name with no entry can't be confirmed.
 */
const ACTION_KINDS = {
  propose_expense: {
    resultTable: "expenses",
    schema: createExpenseSchema,
    /** What the admin may adjust on the card before confirming — never the workspace or the supplier link. */
    overridesSchema: createExpenseSchema
      .pick({ title: true, category: true, amount: true, paymentMethod: true, expenseDate: true, notes: true })
      .partial()
      .strict(),
    execute: (payload: z.infer<typeof createExpenseSchema>, actorUserId: string, tx: DbTransaction) =>
      createExpense(payload, actorUserId, tx),
  },
  propose_revenue: {
    resultTable: "revenues",
    schema: createRevenueSchema,
    overridesSchema: createRevenueSchema
      .pick({ source: true, category: true, amount: true, revenueDate: true, notes: true })
      .partial()
      .strict(),
    execute: (payload: z.infer<typeof createRevenueSchema>, actorUserId: string, tx: DbTransaction) =>
      createRevenue(payload, actorUserId, tx),
  },
  propose_supplier_bill: {
    resultTable: "ledger_transactions",
    schema: createSupplierBillSchema,
    // Not the supplier: the card was checked against that supplier's name.
    overridesSchema: createSupplierBillSchema
      .pick({ amount: true, transactionDate: true, dueDate: true, notes: true })
      .partial()
      .strict(),
    execute: (payload: z.infer<typeof createSupplierBillSchema>, actorUserId: string, tx: DbTransaction) =>
      createSupplierBill(payload, actorUserId, tx),
  },
} as const;

export type ActionKind = keyof typeof ACTION_KINDS;

function actionKind(toolName: string): (typeof ACTION_KINDS)[ActionKind] {
  const kind = ACTION_KINDS[toolName as ActionKind];
  if (!kind) throw new Error(`No executor registered for assistant action "${toolName}"`);
  return kind;
}

export type ActionRow = typeof aiActions.$inferSelect;

/**
 * Records a draft. `payload` must already have passed the kind's schema —
 * the tool validates first so the model hears about a bad draft
 * immediately, instead of the admin finding out on Confirm.
 */
export async function createProposedAction(input: {
  conversationId: string;
  toolName: ActionKind;
  toolUseId: string | null;
  brandId: string;
  payload: Record<string, unknown>;
  assumedFields: string[];
  attachmentId?: string | null;
  display?: Record<string, string>;
  proposedBy: string;
}): Promise<ActionRow> {
  const [row] = await db
    .insert(aiActions)
    .values({
      conversationId: input.conversationId,
      toolName: input.toolName,
      toolUseId: input.toolUseId,
      brandId: input.brandId,
      payload: input.payload,
      assumedFields: input.assumedFields,
      attachmentId: input.attachmentId ?? null,
      display: input.display ?? {},
      proposedBy: input.proposedBy,
    })
    .returning();
  return row!;
}

/** Drafts from a turn that failed before its transcript was saved — no card was ever shown for them, so they're removed rather than left confirmable. */
export async function discardActions(ids: string[]): Promise<void> {
  for (const id of ids) {
    await db.delete(aiActions).where(and(eq(aiActions.id, id), eq(aiActions.status, "proposed")));
  }
}

/** Locks the action row for the rest of the transaction — a second Confirm click waits here, then sees "executed". Scoped to the admin who owns the conversation. */
async function lockOwnedAction(tx: DbTransaction, actionId: string, userId: string): Promise<ActionRow> {
  const [row] = await tx
    .select({ action: aiActions })
    .from(aiActions)
    .innerJoin(aiConversations, eq(aiConversations.id, aiActions.conversationId))
    .where(and(eq(aiActions.id, actionId), eq(aiConversations.userId, userId)))
    .for("update", { of: aiActions })
    .limit(1);
  if (!row) throw ApiError.notFound("Action not found");
  return row.action;
}

function assertStillProposed(action: ActionRow): void {
  if (action.status !== "proposed") {
    throw ApiError.conflict(`This action was already ${action.status}`, { status: action.status });
  }
}

export interface ConfirmResult {
  action: ActionRow;
  record: unknown;
}

type ConfirmOutcome =
  | { kind: "executed"; result: ConfirmResult }
  | { kind: "expired" }
  | { kind: "failed"; message: string };

/**
 * Executes a proposed action. The lock, the business write and the status
 * change share one transaction, so a confirmed action always has exactly
 * one record behind it — a crash can't leave an expense written with its
 * card still confirmable, and a double click can't write two.
 *
 * Outcomes that must persist (expired, failed) are returned and thrown only
 * after the transaction commits; throwing inside would roll the status
 * change back along with everything else.
 */
export async function confirmAction(actionId: string, userId: string, overrides: unknown): Promise<ConfirmResult> {
  const outcome = await db.transaction(async (tx): Promise<ConfirmOutcome> => {
    const action = await lockOwnedAction(tx, actionId, userId);
    assertStillProposed(action);

    if (action.expiresAt.getTime() <= Date.now()) {
      await tx
        .update(aiActions)
        .set({ status: "expired", decidedBy: userId, decidedAt: new Date() })
        .where(eq(aiActions.id, action.id));
      return { kind: "expired" };
    }

    const kind = actionKind(action.toolName);

    // A bad edit on the card is the admin's to fix, so it leaves the action
    // proposed (400) rather than failing it.
    const parsedOverrides = kind.overridesSchema.safeParse(overrides ?? {});
    if (!parsedOverrides.success) {
      throw ApiError.badRequest("Invalid changes to this action", parsedOverrides.error.flatten());
    }
    // Only the keys the admin actually sent. Zod 4 still applies a field's
    // .default() inside .partial(), so the parsed overrides of a lone
    // {amount} edit also carry paymentMethod: "cash" — spreading that would
    // silently overwrite the draft's real payment method.
    const sent = new Set(Object.keys(overrides ?? {}));
    const edits = Object.fromEntries(Object.entries(parsedOverrides.data).filter(([key]) => sent.has(key)));
    const parsedPayload = kind.schema.safeParse({ ...action.payload, ...edits, brandId: action.brandId });
    if (!parsedPayload.success) {
      throw ApiError.badRequest("This action is no longer valid", parsedPayload.error.flatten());
    }

    let record: { id: string };
    try {
      // A savepoint: if the service rejects the write, only its own work
      // rolls back and the action can still be marked failed below.
      record = await tx.transaction((savepoint) =>
        (kind.execute as (payload: unknown, actor: string, tx: DbTransaction) => Promise<{ id: string }>)(
          parsedPayload.data,
          userId,
          savepoint,
        ),
      );
    } catch (err) {
      // Business-rule rejections (e.g. the linked supplier was deleted)
      // won't succeed on retry, so they end the action. Anything else
      // (connection loss, a bug) propagates and leaves it proposed.
      if (!(err instanceof ApiError)) throw err;
      await tx
        .update(aiActions)
        .set({ status: "failed", error: err.message, decidedBy: userId, decidedAt: new Date() })
        .where(eq(aiActions.id, action.id));
      return { kind: "failed", message: err.message };
    }

    const now = new Date();
    const [updated] = await tx
      .update(aiActions)
      .set({
        status: "executed",
        payload: parsedPayload.data,
        resultTable: kind.resultTable,
        resultId: record.id,
        decidedBy: userId,
        decidedAt: now,
        executedAt: now,
      })
      .where(eq(aiActions.id, action.id))
      .returning();
    return { kind: "executed", result: { action: updated!, record } };
  });

  if (outcome.kind === "expired") {
    throw ApiError.conflict("This action expired before it was confirmed — ask the assistant again", { status: "expired" });
  }
  if (outcome.kind === "failed") {
    throw ApiError.conflict(`Couldn't save this: ${outcome.message}`, { status: "failed" });
  }
  return outcome.result;
}

export async function rejectAction(actionId: string, userId: string): Promise<ActionRow> {
  return db.transaction(async (tx) => {
    const action = await lockOwnedAction(tx, actionId, userId);
    assertStillProposed(action);
    const [updated] = await tx
      .update(aiActions)
      .set({ status: "rejected", decidedBy: userId, decidedAt: new Date() })
      .where(eq(aiActions.id, action.id))
      .returning();
    return updated!;
  });
}
