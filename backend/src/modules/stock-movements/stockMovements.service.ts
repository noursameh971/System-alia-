import { desc, eq } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { db } from "../../db/client.js";
import { decrementInventory, incrementInventory } from "../../db/inventoryOperations.js";
import { productVariants, reasonCodes, stockMovements, warehouseBins } from "../../db/schema/index.js";
import { ApiError } from "../../utils/apiError.js";
import type {
  InboundMovementInput,
  OutboundMovementInput,
  ReturnMovementInput,
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
 * Records a `return_in` stock movement — the inventory-side effect of a
 * restock return (put stock back in a bin). The Returns module calls this
 * (via the InTx variant, from its own transaction) only when a return's
 * disposition is `restock`; a `write_off` return never touches inventory,
 * so it never calls this at all.
 */
export async function recordReturnMovementInTx(
  tx: Tx,
  input: ReturnMovementInput,
  actorUserId: string,
): Promise<MovementResult> {
  await assertVariantExists(tx, input.variantId);
  await assertBinExists(tx, input.binId);
  await assertReasonCodeExists(tx, input.reasonCodeId);

  const quantityAfter = await incrementInventory(tx, {
    variantId: input.variantId,
    binId: input.binId,
    quantity: input.quantity,
  });

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
    toBinId: input.binId,
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
