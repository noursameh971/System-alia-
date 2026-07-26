import { desc, eq, sum } from "drizzle-orm";
import { db } from "../../db/client.js";
import { orderItems, productVariants, reasonCodes, returns } from "../../db/schema/index.js";
import { ApiError } from "../../utils/apiError.js";
import { assertBinExists, assertReasonCodeExists, recordReturnMovementInTx } from "../stock-movements/stockMovements.service.js";
import type { CreateReturnInput, ListReturnsQuery } from "./returns.schema.js";

export interface CreatedReturn {
  id: string;
  orderId: string;
  orderItemId: string;
  variantId: string;
  sku: string;
  quantity: number;
  disposition: "restock" | "write_off";
  restockBinId: string | null;
  reasonCodeId: string;
}

/**
 * Processes a return against an existing order item.
 *
 * Per the brief: a return always links back to the original order (via the
 * order item), always requires a reason code, and only touches inventory
 * when disposition is 'restock' — a 'write_off' return is recorded (the
 * `returns` row itself is the audit trail: who processed it, when, why,
 * and what happened to the item) but deliberately never calls the
 * inventory-incrementing movement, since a written-off item never actually
 * goes back on a shelf.
 */
export async function createReturn(input: CreateReturnInput, actorUserId: string): Promise<CreatedReturn> {
  return db.transaction(async (tx) => {
    const [orderItem] = await tx
      .select({
        id: orderItems.id,
        orderId: orderItems.orderId,
        variantId: orderItems.variantId,
        quantity: orderItems.quantity,
        sku: productVariants.sku,
      })
      .from(orderItems)
      .innerJoin(productVariants, eq(productVariants.id, orderItems.variantId))
      .where(eq(orderItems.id, input.orderItemId))
      .limit(1);

    if (!orderItem) throw ApiError.badRequest(`Order item ${input.orderItemId} does not exist`);

    const returnedRows = await tx
      .select({ alreadyReturned: sum(returns.quantity) })
      .from(returns)
      .where(eq(returns.orderItemId, input.orderItemId));
    const returnedSoFar = Number(returnedRows[0]?.alreadyReturned ?? 0);
    const returnable = orderItem.quantity - returnedSoFar;

    if (input.quantity > returnable) {
      throw ApiError.badRequest(
        `Cannot return ${input.quantity} — only ${returnable} of ${orderItem.sku} remain returnable on this order item ` +
          `(${orderItem.quantity} ordered, ${returnedSoFar} already returned)`,
      );
    }

    await assertReasonCodeExists(tx, input.reasonCodeId);
    if (input.disposition === "restock") {
      // zod's refine already guarantees restockBinId is set for 'restock'.
      await assertBinExists(tx, input.restockBinId as string);
    }

    const [returnRow] = await tx
      .insert(returns)
      .values({
        orderId: orderItem.orderId,
        orderItemId: orderItem.id,
        variantId: orderItem.variantId,
        quantity: input.quantity,
        reasonCodeId: input.reasonCodeId,
        disposition: input.disposition,
        restockBinId: input.disposition === "restock" ? (input.restockBinId as string) : null,
        processedBy: actorUserId,
        notes: input.notes,
      })
      .returning();
    if (!returnRow) throw new Error("Return insert returned no row"); // unreachable

    if (input.disposition === "restock") {
      await recordReturnMovementInTx(
        tx,
        {
          variantId: orderItem.variantId,
          binId: input.restockBinId as string,
          quantity: input.quantity,
          reasonCodeId: input.reasonCodeId,
          referenceType: "return",
          referenceId: returnRow.id,
        },
        actorUserId,
      );
    }

    return {
      id: returnRow.id,
      orderId: returnRow.orderId,
      orderItemId: returnRow.orderItemId,
      variantId: returnRow.variantId,
      sku: orderItem.sku,
      quantity: returnRow.quantity,
      disposition: returnRow.disposition,
      restockBinId: returnRow.restockBinId,
      reasonCodeId: returnRow.reasonCodeId,
    };
  });
}

export interface ReturnListItem {
  id: string;
  orderId: string;
  orderItemId: string;
  sku: string;
  quantity: number;
  disposition: string;
  reasonLabel: string;
  restockBinId: string | null;
  notes: string | null;
  createdAt: Date;
}

export async function listReturns(filters: ListReturnsQuery): Promise<ReturnListItem[]> {
  return db
    .select({
      id: returns.id,
      orderId: returns.orderId,
      orderItemId: returns.orderItemId,
      sku: productVariants.sku,
      quantity: returns.quantity,
      disposition: returns.disposition,
      reasonLabel: reasonCodes.label,
      restockBinId: returns.restockBinId,
      notes: returns.notes,
      createdAt: returns.createdAt,
    })
    .from(returns)
    .innerJoin(productVariants, eq(productVariants.id, returns.variantId))
    .innerJoin(reasonCodes, eq(reasonCodes.id, returns.reasonCodeId))
    .where(filters.orderId ? eq(returns.orderId, filters.orderId) : undefined)
    .orderBy(desc(returns.createdAt));
}
