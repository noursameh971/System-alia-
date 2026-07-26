import { desc, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { decrementInventory, incrementInventory } from "../../db/inventoryOperations.js";
import {
  productVariants,
  reasonCodes,
  stockMovements,
  warehouseBins,
} from "../../db/schema/index.js";
import { ApiError } from "../../utils/apiError.js";
import type {
  InboundMovementInput,
  OutboundMovementInput,
  ReturnMovementInput,
  TransferMovementInput,
} from "./stockMovements.schema.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertVariantExists(tx: any, variantId: string): Promise<void> {
  const [row] = await tx
    .select({ id: productVariants.id })
    .from(productVariants)
    .where(eq(productVariants.id, variantId))
    .limit(1);
  if (!row) throw ApiError.badRequest(`Variant ${variantId} does not exist`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertBinExists(tx: any, binId: string): Promise<void> {
  const [row] = await tx
    .select({ id: warehouseBins.id })
    .from(warehouseBins)
    .where(eq(warehouseBins.id, binId))
    .limit(1);
  if (!row) throw ApiError.badRequest(`Bin ${binId} does not exist`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertReasonCodeExists(tx: any, reasonCodeId: string): Promise<void> {
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

export async function recordInboundMovement(
  input: InboundMovementInput,
  actorUserId: string,
): Promise<MovementResult> {
  return db.transaction(async (tx) => {
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
  });
}

export async function recordOutboundMovement(
  input: OutboundMovementInput,
  actorUserId: string,
): Promise<MovementResult> {
  return db.transaction(async (tx) => {
    await assertVariantExists(tx, input.variantId);
    await assertBinExists(tx, input.binId);

    // Throws ApiError.conflict (409) and rolls back the whole transaction if
    // there isn't enough stock — nothing else in this function has run a
    // write yet, so there's nothing to undo.
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
  });
}

export async function recordTransferMovement(
  input: TransferMovementInput,
  actorUserId: string,
): Promise<MovementResult> {
  return db.transaction(async (tx) => {
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
  });
}

/**
 * Records a `return_in` stock movement — the inventory-side effect of a
 * return (put stock back in a bin). The `returns` table (linking this back
 * to the original order/order_item with a restock-vs-write-off decision)
 * belongs to the Orders & Returns module, which hasn't been built yet; when
 * it lands, it will call this same function and pass referenceType='return'
 * + referenceId=<returns.id> to link the two records together.
 */
export async function recordReturnMovement(
  input: ReturnMovementInput,
  actorUserId: string,
): Promise<MovementResult> {
  return db.transaction(async (tx) => {
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
  });
}

export async function listMovementsForVariant(variantId: string, limit = 50) {
  return db
    .select()
    .from(stockMovements)
    .where(eq(stockMovements.variantId, variantId))
    .orderBy(desc(stockMovements.createdAt))
    .limit(limit);
}
