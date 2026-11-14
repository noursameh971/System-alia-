import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { alias, type PgTransaction } from "drizzle-orm/pg-core";
import { db } from "../../db/client.js";
import { decrementInventory, incrementInventory } from "../../db/inventoryOperations.js";
import { inventory, productVariants, products, reasonCodes, stockMovements, users, warehouseBins } from "../../db/schema/index.js";
import { ApiError } from "../../utils/apiError.js";
import type {
  BatchMovementInput,
  InboundMovementInput,
  OutboundMovementInput,
  ReturnMovementInput,
  RevertMovementsInput,
  TransferMovementInput,
} from "./stockMovements.schema.js";

// PgTransaction's generic params aren't meaningfully constrainable here; see inventoryOperations.ts's identical alias.
type Tx = PgTransaction<any, any, any>;

export async function assertVariantExists(tx: Tx, variantId: string): Promise<void> {
  const [row] = await tx
    .select({ id: productVariants.id })
    .from(productVariants)
    .where(eq(productVariants.id, variantId))
    .limit(1);
  if (!row) throw ApiError.badRequest(`Variant ${variantId} does not exist`);
}

export async function assertBinExists(tx: Tx, binId: string): Promise<void> {
  const [row] = await tx
    .select({ id: warehouseBins.id })
    .from(warehouseBins)
    .where(eq(warehouseBins.id, binId))
    .limit(1);
  if (!row) throw ApiError.badRequest(`Bin ${binId} does not exist`);
}

export async function assertReasonCodeExists(tx: Tx, reasonCodeId: string): Promise<void> {
  const [row] = await tx
    .select({ id: reasonCodes.id })
    .from(reasonCodes)
    .where(eq(reasonCodes.id, reasonCodeId))
    .limit(1);
  if (!row) throw ApiError.badRequest(`Reason code ${reasonCodeId} does not exist`);
}

export interface MovementResult {
  movementId: string;
  variantId: string;
  quantity: number;
  fromBinId: string | null;
  toBinId: string | null;
  fromBinQuantityAfter: number | null;
  toBinQuantityAfter: number | null;
}

/**
 * Every `record*Movement` function below has an `...InTx` twin that does the
 * actual work against a caller-supplied transaction, and a thin public
 * wrapper that opens its own `db.transaction()` for standalone use (the
 * `/api/stock-movements/*` routes). This split exists so the Orders &
 * Returns module can compose an outbound/return movement into its *own*
 * order/return transaction — "create the order" and "decrement the stock"
 * must commit or roll back as one unit, which isn't possible if the
 * movement function insists on opening a second, independent transaction.
 */

export async function recordInboundMovementInTx(
  tx: Tx,
  input: InboundMovementInput,
  actorUserId: string,
): Promise<MovementResult> {
  await assertVariantExists(tx, input.variantId);
  await assertBinExists(tx, input.binId);

  const quantityAfter = await incrementInventory(tx, {
    variantId: input.variantId,
    binId: input.binId,
    quantity: input.quantity,
  });

  const [movement] = await tx
    .insert(stockMovements)
    .values({
      variantId: input.variantId,
      movementType: "inbound",
      quantity: input.quantity,
      toBinId: input.binId,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      performedBy: actorUserId,
      notes: input.notes,
    })
    .returning();
  if (!movement) throw new Error("Movement insert returned no row"); // unreachable

  return {
    movementId: movement.id,
    variantId: input.variantId,
    quantity: input.quantity,
    fromBinId: null,
    toBinId: input.binId,
    fromBinQuantityAfter: null,
    toBinQuantityAfter: quantityAfter,
  };
}

export async function recordInboundMovement(
  input: InboundMovementInput,
  actorUserId: string,
): Promise<MovementResult> {
  return db.transaction((tx) => recordInboundMovementInTx(tx, input, actorUserId));
}

export async function recordOutboundMovementInTx(
  tx: Tx,
  input: OutboundMovementInput,
  actorUserId: string,
): Promise<MovementResult> {
  await assertVariantExists(tx, input.variantId);
  await assertBinExists(tx, input.binId);

  // Throws ApiError.conflict (409) and rolls back the whole (possibly
  // caller-owned) transaction if there isn't enough stock.
  const quantityAfter = await decrementInventory(tx, {
    variantId: input.variantId,
    binId: input.binId,
    quantity: input.quantity,
  });

  const [movement] = await tx
    .insert(stockMovements)
    .values({
      variantId: input.variantId,
      movementType: "outbound",
      quantity: input.quantity,
      fromBinId: input.binId,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      performedBy: actorUserId,
      notes: input.notes,
    })
    .returning();
  if (!movement) throw new Error("Movement insert returned no row"); // unreachable

  return {
    movementId: movement.id,
    variantId: input.variantId,
    quantity: input.quantity,
    fromBinId: input.binId,
    toBinId: null,
    fromBinQuantityAfter: quantityAfter,
    toBinQuantityAfter: null,
  };
}

export async function recordOutboundMovement(
  input: OutboundMovementInput,
  actorUserId: string,
): Promise<MovementResult> {
  return db.transaction((tx) => recordOutboundMovementInTx(tx, input, actorUserId));
}

/**
 * Records a `gift` movement — stock given away for free. Same bin shape and
 * inventory effect as an outbound sale (decrements a source bin, no
 * destination), but a distinct movement_type so it never gets counted as a
 * sale in the Recent Movements Log or any reporting built on movement_type.
 * Reuses OutboundMovementInput's shape (variantId/binId/quantity +
 * reference fields) rather than a byte-identical twin schema — this is only
 * ever called from the batch scan queue today, never a standalone route.
 */
export async function recordGiftMovementInTx(
  tx: Tx,
  input: OutboundMovementInput,
  actorUserId: string,
): Promise<MovementResult> {
  await assertVariantExists(tx, input.variantId);
  await assertBinExists(tx, input.binId);

  const quantityAfter = await decrementInventory(tx, {
    variantId: input.variantId,
    binId: input.binId,
    quantity: input.quantity,
  });

  const [movement] = await tx
    .insert(stockMovements)
    .values({
      variantId: input.variantId,
      movementType: "gift",
      quantity: input.quantity,
      fromBinId: input.binId,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      performedBy: actorUserId,
      notes: input.notes,
    })
    .returning();
  if (!movement) throw new Error("Movement insert returned no row"); // unreachable

  return {
    movementId: movement.id,
    variantId: input.variantId,
    quantity: input.quantity,
    fromBinId: input.binId,
    toBinId: null,
    fromBinQuantityAfter: quantityAfter,
    toBinQuantityAfter: null,
  };
}

export async function recordTransferMovementInTx(
  tx: Tx,
  input: TransferMovementInput,
  actorUserId: string,
): Promise<MovementResult> {
  await assertVariantExists(tx, input.variantId);
  await assertBinExists(tx, input.fromBinId);
  await assertBinExists(tx, input.toBinId);

  // Decrement first: if the source doesn't have enough stock this throws
  // and the transaction rolls back before the destination is ever touched.
  const fromQuantityAfter = await decrementInventory(tx, {
    variantId: input.variantId,
    binId: input.fromBinId,
    quantity: input.quantity,
  });
  const toQuantityAfter = await incrementInventory(tx, {
    variantId: input.variantId,
    binId: input.toBinId,
    quantity: input.quantity,
  });

  const [movement] = await tx
    .insert(stockMovements)
    .values({
      variantId: input.variantId,
      movementType: "transfer",
      quantity: input.quantity,
      fromBinId: input.fromBinId,
      toBinId: input.toBinId,
      performedBy: actorUserId,
      notes: input.notes,
    })
    .returning();
  if (!movement) throw new Error("Movement insert returned no row"); // unreachable

  return {
    movementId: movement.id,
    variantId: input.variantId,
    quantity: input.quantity,
    fromBinId: input.fromBinId,
    toBinId: input.toBinId,
    fromBinQuantityAfter: fromQuantityAfter,
    toBinQuantityAfter: toQuantityAfter,
  };
}

export async function recordTransferMovement(
  input: TransferMovementInput,
  actorUserId: string,
): Promise<MovementResult> {
  return db.transaction((tx) => recordTransferMovementInTx(tx, input, actorUserId));
}

/**
 * Records a `return_in` stock movement. Two shapes, both audited the same
 * way (same movementType, so both read as "Return" in any UI):
 *
 *  - `binId` set: a restock — stock physically goes back into that bin.
 *    The Returns module calls this (via the InTx variant, from its own
 *    transaction) when a return's disposition is `restock`; a `write_off`
 *    order-return never touches inventory, so it never calls this at all.
 *  - `binId` omitted: a Damaged/Lost audit entry from the Inventory page's
 *    Return flow — logged for the record but deliberately never increments
 *    any bin, so it can't inflate sellable stock. `chk_movement_bins`
 *    (migration 0005) permits `return_in` rows with a null `to_bin_id`
 *    specifically for this case.
 */
export async function recordReturnMovementInTx(
  tx: Tx,
  input: ReturnMovementInput,
  actorUserId: string,
): Promise<MovementResult> {
  await assertVariantExists(tx, input.variantId);
  if (input.reasonCodeId) await assertReasonCodeExists(tx, input.reasonCodeId);

  let quantityAfter: number | null = null;
  if (input.binId) {
    await assertBinExists(tx, input.binId);
    quantityAfter = await incrementInventory(tx, {
      variantId: input.variantId,
      binId: input.binId,
      quantity: input.quantity,
    });
  }

  const [movement] = await tx
    .insert(stockMovements)
    .values({
      variantId: input.variantId,
      movementType: "return_in",
      quantity: input.quantity,
      toBinId: input.binId,
      reasonCodeId: input.reasonCodeId,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      performedBy: actorUserId,
      notes: input.notes,
    })
    .returning();
  if (!movement) throw new Error("Movement insert returned no row"); // unreachable

  return {
    movementId: movement.id,
    variantId: input.variantId,
    quantity: input.quantity,
    fromBinId: null,
    toBinId: input.binId ?? null,
    fromBinQuantityAfter: null,
    toBinQuantityAfter: quantityAfter,
  };
}

export async function recordReturnMovement(
  input: ReturnMovementInput,
  actorUserId: string,
): Promise<MovementResult> {
  return db.transaction((tx) => recordReturnMovementInTx(tx, input, actorUserId));
}

export async function listMovementsForVariant(variantId: string, limit = 50) {
  return db
    .select()
    .from(stockMovements)
    .where(eq(stockMovements.variantId, variantId))
    .orderBy(desc(stockMovements.createdAt))
    .limit(limit);
}

const DAMAGED_REASON_CODE = "DAMAGED";

/** A queued line that couldn't be applied because the source bin didn't hold enough stock — reported back per line instead of failing the whole batch. */
export interface SkippedBatchItem {
  variantId: string;
  requested: number;
  available: number;
}

export interface BatchMovementResult {
  movementType: BatchMovementInput["movementType"];
  itemCount: number;
  totalQuantity: number;
  results: MovementResult[];
  /** Empty for a fully-applied batch. Lines here were left untouched — the client keeps them queued so the operator can fix the count and retry just those. */
  skipped: SkippedBatchItem[];
}

interface BatchItem {
  variantId: string;
  quantity: number;
}

/**
 * Splits a batch's line items into the ones the source bin can actually
 * cover and the ones it can't, so a single short line doesn't take the rest
 * of the scan queue down with it (see recordBatchMovement).
 *
 * This read is a *scheduling* filter, not the safety guard: decrementInventory's
 * `quantity >= requested` WHERE clause is still the sole authority on whether
 * a decrement is allowed, and still runs for every line that gets through
 * here. A concurrent movement landing between this read and the write is
 * therefore still caught correctly by that clause — this pass just avoids
 * queueing up work that's already known to fail.
 *
 * The running `remaining` tally matters when the same variant appears on
 * more than one line (the scan UI merges duplicates, but the API is callable
 * directly): without it, two lines of 3 against 4 on hand would both look
 * affordable here and the second would then fail at write time.
 */
async function splitByAvailability(
  tx: Tx,
  binId: string,
  items: BatchItem[],
): Promise<{ applicable: BatchItem[]; skipped: SkippedBatchItem[] }> {
  const variantIds = [...new Set(items.map((item) => item.variantId))];
  const rows = await tx
    .select({ variantId: inventory.variantId, quantity: inventory.quantity })
    .from(inventory)
    .where(and(eq(inventory.binId, binId), inArray(inventory.variantId, variantIds)));

  const remaining = new Map(rows.map((row) => [row.variantId, row.quantity]));
  const applicable: BatchItem[] = [];
  const skipped: SkippedBatchItem[] = [];

  for (const item of items) {
    const available = remaining.get(item.variantId) ?? 0;
    if (item.quantity > available) {
      skipped.push({ variantId: item.variantId, requested: item.quantity, available });
      continue;
    }
    remaining.set(item.variantId, available - item.quantity);
    applicable.push(item);
  }

  return { applicable, skipped };
}

/**
 * Processes the Inventory page's Scanned Batch Queue: every line item goes
 * through the exact same `record*InTx` function (and therefore the exact
 * same validation/insufficient-stock checks) a single-item movement would,
 * inside ONE transaction.
 *
 * Partial application, deliberately: a line the source bin can't cover is
 * skipped and reported in `skipped` rather than aborting the batch. This
 * used to be all-or-nothing, which meant one miscounted line (or one label
 * scanned twice) threw away an entire scanning session's work — with 17
 * requested against 4 on hand, all 17 lines were lost and nothing recorded
 * which line was at fault. Lines that DO apply are still atomic with each
 * other: they share one transaction, so a genuine failure (a bad variant
 * id, a DB error, a concurrent decrement beating this one) still rolls the
 * whole thing back. The skip list is only ever "this bin doesn't hold that
 * many", which is an operator-fixable counting mistake, not a failure.
 *
 * A batch where NOTHING can be applied still throws the 409 it always did —
 * there's no partial success to report, and the caller should see it as a
 * failed batch rather than a silent no-op.
 */
export async function recordBatchMovement(input: BatchMovementInput, actorUserId: string): Promise<BatchMovementResult> {
  return db.transaction(async (tx) => {
    const results: MovementResult[] = [];
    let skipped: SkippedBatchItem[] = [];

    if (input.movementType === "inbound") {
      // Inbound only ever adds stock — nothing to be short of.
      for (const item of input.items) {
        results.push(
          await recordInboundMovementInTx(tx, { variantId: item.variantId, binId: input.toBinId, quantity: item.quantity }, actorUserId),
        );
      }
    } else if (input.movementType === "outbound") {
      const split = await splitByAvailability(tx, input.fromBinId, input.items);
      skipped = split.skipped;
      for (const item of split.applicable) {
        results.push(
          await recordOutboundMovementInTx(tx, { variantId: item.variantId, binId: input.fromBinId, quantity: item.quantity }, actorUserId),
        );
      }
    } else if (input.movementType === "gift") {
      const split = await splitByAvailability(tx, input.fromBinId, input.items);
      skipped = split.skipped;
      for (const item of split.applicable) {
        results.push(
          await recordGiftMovementInTx(tx, { variantId: item.variantId, binId: input.fromBinId, quantity: item.quantity }, actorUserId),
        );
      }
    } else if (input.movementType === "transfer") {
      const split = await splitByAvailability(tx, input.fromBinId, input.items);
      skipped = split.skipped;
      for (const item of split.applicable) {
        results.push(
          await recordTransferMovementInTx(
            tx,
            { variantId: item.variantId, fromBinId: input.fromBinId, toBinId: input.toBinId, quantity: item.quantity },
            actorUserId,
          ),
        );
      }
    } else {
      // Damaged/Lost items are tagged with the DAMAGED reason code
      // automatically — the fast-scan UI asks for an optional free-text
      // Reason instead of making the user pick a code from a dropdown.
      let reasonCodeId: string | undefined;
      if (input.condition === "damaged") {
        const [damaged] = await tx.select({ id: reasonCodes.id }).from(reasonCodes).where(eq(reasonCodes.code, DAMAGED_REASON_CODE)).limit(1);
        reasonCodeId = damaged?.id;
      }

      for (const item of input.items) {
        results.push(
          await recordReturnMovementInTx(
            tx,
            {
              variantId: item.variantId,
              binId: input.condition === "good" ? input.toBinId : undefined,
              quantity: item.quantity,
              reasonCodeId,
              notes: input.reason,
            },
            actorUserId,
          ),
        );
      }
    }

    // Every line was short — there's no partial success to report, so this
    // stays the 409 it has always been (the client's existing
    // "nothing in this batch was saved" path). `details` keeps the original
    // single-line shape so that message renders unchanged, plus the full
    // per-line list for a multi-line batch.
    if (results.length === 0 && skipped.length > 0) {
      const [first] = skipped;
      throw ApiError.conflict("Insufficient stock in the source bin", {
        variantId: first!.variantId,
        requested: first!.requested,
        available: first!.available,
        skipped,
      });
    }

    return {
      movementType: input.movementType,
      itemCount: results.length,
      totalQuantity: results.reduce((sum, r) => sum + r.quantity, 0),
      results,
      skipped,
    };
  });
}

/**
 * Movements written on behalf of another module's record. Reverting one here
 * would leave that record (an order, a customer return, a factory hand-off)
 * claiming stock moved when it no longer has, so those are undone from
 * their own module instead.
 */
const NON_REVERTIBLE_REFERENCE_TYPES: Record<string, string> = {
  order: "an order",
  return: "a customer return",
  brand: "a factory transfer",
};

function revertBlockReason(m: { revertedAt: Date | null; reversalOfId: string | null; referenceType: string | null }): string | null {
  if (m.revertedAt) return "already reverted";
  if (m.reversalOfId) return "it is itself a revert";
  const owner = m.referenceType ? NON_REVERTIBLE_REFERENCE_TYPES[m.referenceType] : undefined;
  if (owner) return `it belongs to ${owner}`;
  return null;
}

export interface RecentMovementLogItem {
  id: string;
  movementType: string;
  quantity: number;
  createdAt: Date;
  sku: string;
  productName: string;
  performedByName: string;
  reasonLabel: string | null;
  notes: string | null;
  revertedAt: Date | null;
  revertedByName: string | null;
  reversalOfId: string | null;
  /** False when revertMovements would refuse this row (already reverted, a revert itself, or owned by another module). */
  revertible: boolean;
}

/**
 * Backs the Inventory page's "Recent Movements Log" — one brand's movements
 * across every type, newest first, a page at a time (`offset` walks back
 * through the full history). id breaks created_at ties so lines from the
 * same batch transaction keep a stable order across pages.
 */
export async function listRecentMovementsForBrand(brandId: string, limit = 10, offset = 0): Promise<RecentMovementLogItem[]> {
  const reverter = alias(users, "reverter");
  const rows = await db
    .select({
      id: stockMovements.id,
      movementType: stockMovements.movementType,
      quantity: stockMovements.quantity,
      createdAt: stockMovements.createdAt,
      notes: stockMovements.notes,
      referenceType: stockMovements.referenceType,
      revertedAt: stockMovements.revertedAt,
      reversalOfId: stockMovements.reversalOfId,
      sku: productVariants.sku,
      productName: products.name,
      performedByName: users.fullName,
      reasonLabel: reasonCodes.label,
      revertedByName: reverter.fullName,
    })
    .from(stockMovements)
    .innerJoin(productVariants, eq(productVariants.id, stockMovements.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .innerJoin(users, eq(users.id, stockMovements.performedBy))
    .leftJoin(reasonCodes, eq(reasonCodes.id, stockMovements.reasonCodeId))
    .leftJoin(reverter, eq(reverter.id, stockMovements.revertedBy))
    .where(eq(products.brandId, brandId))
    .orderBy(desc(stockMovements.createdAt), desc(stockMovements.id))
    .limit(limit)
    .offset(offset);

  return rows.map(({ referenceType, ...r }) => ({
    ...r,
    reasonLabel: r.reasonLabel ?? null,
    revertedByName: r.revertedByName ?? null,
    revertible: revertBlockReason({ ...r, referenceType }) === null,
  }));
}

export interface RevertMovementsResult {
  revertedCount: number;
  totalQuantity: number;
  /** One inverse movement per reverted original (none for a no-bin Damaged/Lost return, which never touched stock). */
  reversalIds: string[];
}

/**
 * Admin Revert / Undo: applies the exact inverse of each selected movement
 * to the same variant and bin(s), in ONE transaction — if any line can't be
 * undone (e.g. stock that came in has since been sold, so the bin can't give
 * it back), nothing is reverted.
 *
 *  - stock out of a bin (outbound, gift, decreasing adjustment) → added back to that bin
 *  - stock into a bin (inbound, restocked return, increasing adjustment) → taken back out
 *  - transfer → moved back from the destination to the source bin
 *  - Damaged/Lost return (no bin) → only marked reverted; it never changed stock
 *
 * The inverse is recorded as its own movement (an `adjustment`, or a
 * `transfer` for a transfer) pointing back via reversal_of_id, and the
 * original is stamped reverted_at/reverted_by. Rows are locked FOR UPDATE
 * and processed newest-first, so concurrent reverts of the same row
 * serialize and the second one sees it as already reverted.
 */
export async function revertMovementsInTx(tx: Tx, input: RevertMovementsInput, actorUserId: string): Promise<RevertMovementsResult> {
  const ids = [...new Set(input.movementIds)];
  const rows = await tx
    .select({
      id: stockMovements.id,
      variantId: stockMovements.variantId,
      movementType: stockMovements.movementType,
      quantity: stockMovements.quantity,
      fromBinId: stockMovements.fromBinId,
      toBinId: stockMovements.toBinId,
      referenceType: stockMovements.referenceType,
      revertedAt: stockMovements.revertedAt,
      reversalOfId: stockMovements.reversalOfId,
      createdAt: stockMovements.createdAt,
      brandId: products.brandId,
      sku: productVariants.sku,
    })
    .from(stockMovements)
    .innerJoin(productVariants, eq(productVariants.id, stockMovements.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(inArray(stockMovements.id, ids))
    .orderBy(desc(stockMovements.createdAt))
    .for("update", { of: stockMovements });

  // A movement from another brand is reported the same as a missing one — no cross-brand probing.
  const found = rows.filter((row) => row.brandId === input.brandId);
  if (found.length !== ids.length) throw ApiError.notFound("One or more movements were not found in this workspace");

  for (const row of found) {
    const reason = revertBlockReason(row);
    if (reason) throw ApiError.conflict(`Can't revert the ${row.movementType} movement for ${row.sku}: ${reason}`);
  }

  const reversalIds: string[] = [];
  for (const row of found) {
    const { variantId, quantity, fromBinId, toBinId } = row;
    const takeBack = async (binId: string) => {
      try {
        await decrementInventory(tx, { variantId, binId, quantity });
      } catch (err) {
        if (err instanceof ApiError && err.statusCode === 409) {
          throw ApiError.conflict(
            `Can't revert the ${row.movementType} movement for ${row.sku}: the bin no longer holds ${quantity} of it (stock has moved since)`,
            err.details,
          );
        }
        throw err;
      }
    };

    let reversal: { fromBinId: string | null; toBinId: string | null; movementType: "adjustment" | "transfer" } | null = null;
    if (fromBinId && toBinId) {
      await takeBack(toBinId);
      await incrementInventory(tx, { variantId, binId: fromBinId, quantity });
      reversal = { movementType: "transfer", fromBinId: toBinId, toBinId: fromBinId };
    } else if (fromBinId) {
      await incrementInventory(tx, { variantId, binId: fromBinId, quantity });
      reversal = { movementType: "adjustment", fromBinId: null, toBinId: fromBinId };
    } else if (toBinId) {
      await takeBack(toBinId);
      reversal = { movementType: "adjustment", fromBinId: toBinId, toBinId: null };
    }

    if (reversal) {
      const [inserted] = await tx
        .insert(stockMovements)
        .values({
          variantId,
          quantity,
          ...reversal,
          reversalOfId: row.id,
          performedBy: actorUserId,
          notes: `Revert of ${row.movementType} movement`,
        })
        .returning({ id: stockMovements.id });
      if (!inserted) throw new Error("Movement insert returned no row"); // unreachable
      reversalIds.push(inserted.id);
    }

    await tx
      .update(stockMovements)
      .set({ revertedAt: sql`now()`, revertedBy: actorUserId })
      .where(and(eq(stockMovements.id, row.id), isNull(stockMovements.revertedAt)));
  }

  return {
    revertedCount: found.length,
    totalQuantity: found.reduce((sum, row) => sum + row.quantity, 0),
    reversalIds,
  };
}

export async function revertMovements(input: RevertMovementsInput, actorUserId: string): Promise<RevertMovementsResult> {
  return db.transaction((tx) => revertMovementsInTx(tx, input, actorUserId));
}
