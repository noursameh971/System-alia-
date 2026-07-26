import { and, desc, eq, inArray, isNull, sql, sum } from "drizzle-orm";
import { db } from "../../db/client.js";
import {
  attributeValues,
  attributes,
  brands,
  orderItems,
  orders,
  productVariants,
  products,
  returns,
  variantAttributeValues,
  variantPrices,
} from "../../db/schema/index.js";
import { ApiError } from "../../utils/apiError.js";
import { recordOutboundMovementInTx } from "../stock-movements/stockMovements.service.js";
import type { CreateOrderInput, ListOrdersQuery } from "./orders.schema.js";

function buildOrderNumber(brandCode: string, sequence: number): string {
  return `${brandCode}-ORD-${String(sequence).padStart(6, "0")}`;
}

export interface CreatedOrderItem {
  id: string;
  variantId: string;
  sku: string;
  quantity: number;
  unitPriceAtSale: number;
  subtotal: number;
}

export interface CreatedOrder {
  id: string;
  orderNumber: string;
  brandId: string;
  status: string;
  customerName: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  orderDate: Date;
  items: CreatedOrderItem[];
}

/**
 * Creates an order and its line items, decrementing inventory for every
 * item in the same transaction (via recordOutboundMovementInTx) — the
 * order only exists if every item was actually available to fulfill. Any
 * item with insufficient stock throws (see decrementInventory) and rolls
 * back the whole order, including items that had already been decremented
 * earlier in the loop.
 */
export async function createOrder(input: CreateOrderInput, actorUserId: string): Promise<CreatedOrder> {
  return db.transaction(async (tx) => {
    const [brand] = await tx.select().from(brands).where(eq(brands.id, input.brandId)).limit(1);
    if (!brand) throw ApiError.badRequest(`Brand ${input.brandId} does not exist`);

    // Resolve + validate every line item up front: variant exists, belongs
    // to this order's brand (brand-exclusive catalog, per Step 1), and has
    // an active price to snapshot. Fail on the first problem before any
    // inventory is touched.
    const resolvedItems: { variantId: string; binId: string; quantity: number; sku: string; unitPrice: number }[] =
      [];
    for (const item of input.items) {
      const [variantRow] = await tx
        .select({
          id: productVariants.id,
          sku: productVariants.sku,
          brandId: products.brandId,
        })
        .from(productVariants)
        .innerJoin(products, eq(products.id, productVariants.productId))
        .where(eq(productVariants.id, item.variantId))
        .limit(1);

      if (!variantRow) throw ApiError.badRequest(`Variant ${item.variantId} does not exist`);
      if (variantRow.brandId !== input.brandId) {
        throw ApiError.badRequest(
          `Variant ${variantRow.sku} belongs to a different brand than this order (${brand.name})`,
        );
      }

      const [priceRow] = await tx
        .select({ price: variantPrices.price })
        .from(variantPrices)
        .where(and(eq(variantPrices.variantId, item.variantId), isNull(variantPrices.effectiveTo)))
        .limit(1);
      if (!priceRow) throw ApiError.badRequest(`Variant ${variantRow.sku} has no active price set`);

      resolvedItems.push({
        variantId: item.variantId,
        binId: item.binId,
        quantity: item.quantity,
        sku: variantRow.sku,
        unitPrice: Number(priceRow.price),
      });
    }

    const seqResult = await tx.execute<{ seq: string }>(sql`select nextval('order_number_seq') as seq`);
    const orderNumber = buildOrderNumber(brand.code, Number(seqResult.rows[0]?.seq));

    const [order] = await tx
      .insert(orders)
      .values({
        brandId: input.brandId,
        orderNumber,
        customerName: input.customerName ?? null,
        customerPhone: input.customerPhone ?? null,
        customerAddress: input.customerAddress ?? null,
        createdBy: actorUserId,
      })
      .returning();
    if (!order) throw new Error("Order insert returned no row"); // unreachable

    const createdItems: CreatedOrderItem[] = [];
    for (const item of resolvedItems) {
      // Decrements inventory + logs the outbound stock movement, in this
      // same transaction — insufficient stock throws here and the entire
      // order (including any items already processed above) rolls back.
      await recordOutboundMovementInTx(
        tx,
        {
          variantId: item.variantId,
          binId: item.binId,
          quantity: item.quantity,
          referenceType: "order",
          referenceId: order.id,
        },
        actorUserId,
      );

      const [orderItem] = await tx
        .insert(orderItems)
        .values({
          orderId: order.id,
          variantId: item.variantId,
          quantity: item.quantity,
          unitPriceAtSale: item.unitPrice.toFixed(2),
        })
        .returning();
      if (!orderItem) throw new Error("Order item insert returned no row"); // unreachable

      createdItems.push({
        id: orderItem.id,
        variantId: item.variantId,
        sku: item.sku,
        quantity: item.quantity,
        unitPriceAtSale: item.unitPrice,
        subtotal: Number(orderItem.subtotal),
      });
    }

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      brandId: order.brandId,
      status: order.status,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      customerAddress: order.customerAddress,
      orderDate: order.orderDate,
      items: createdItems,
    };
  });
}

export interface OrderListItem {
  id: string;
  orderNumber: string;
  status: string;
  customerName: string | null;
  orderDate: Date;
  brand: { id: string; name: string; code: string };
  itemCount: number;
  total: number;
}

export async function listOrders(filters: ListOrdersQuery): Promise<OrderListItem[]> {
  const conditions = [
    filters.brandId ? eq(orders.brandId, filters.brandId) : undefined,
    filters.status ? eq(orders.status, filters.status) : undefined,
  ].filter((c) => c !== undefined);

  const orderRows = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      customerName: orders.customerName,
      orderDate: orders.orderDate,
      brandId: brands.id,
      brandName: brands.name,
      brandCode: brands.code,
    })
    .from(orders)
    .innerJoin(brands, eq(brands.id, orders.brandId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(orders.orderDate));

  if (orderRows.length === 0) return [];

  const orderIds = orderRows.map((o) => o.id);
  const totals = await db
    .select({
      orderId: orderItems.orderId,
      itemCount: sql<number>`count(*)::int`,
      total: sum(orderItems.subtotal),
    })
    .from(orderItems)
    .where(inArray(orderItems.orderId, orderIds))
    .groupBy(orderItems.orderId);

  const totalsByOrder = new Map(totals.map((t) => [t.orderId, t]));

  return orderRows.map((o) => {
    const t = totalsByOrder.get(o.id);
    return {
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      customerName: o.customerName,
      orderDate: o.orderDate,
      brand: { id: o.brandId, name: o.brandName, code: o.brandCode },
      itemCount: t?.itemCount ?? 0,
      total: t?.total ? Number(t.total) : 0,
    };
  });
}

export interface OrderDetailItem {
  id: string;
  variantId: string;
  sku: string;
  productName: string;
  attributes: { attributeName: string; value: string }[];
  quantity: number;
  unitPriceAtSale: number;
  subtotal: number;
  returnedQuantity: number;
  returnableQuantity: number;
}

export interface OrderDetail {
  id: string;
  orderNumber: string;
  status: string;
  customerName: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  orderDate: Date;
  brand: { id: string; name: string; code: string };
  items: OrderDetailItem[];
}

export async function getOrderById(orderId: string): Promise<OrderDetail | null> {
  const [order] = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      customerName: orders.customerName,
      customerPhone: orders.customerPhone,
      customerAddress: orders.customerAddress,
      orderDate: orders.orderDate,
      brandId: brands.id,
      brandName: brands.name,
      brandCode: brands.code,
    })
    .from(orders)
    .innerJoin(brands, eq(brands.id, orders.brandId))
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!order) return null;

  const itemRows = await db
    .select({
      id: orderItems.id,
      variantId: orderItems.variantId,
      sku: productVariants.sku,
      productName: products.name,
      quantity: orderItems.quantity,
      unitPriceAtSale: orderItems.unitPriceAtSale,
      subtotal: orderItems.subtotal,
    })
    .from(orderItems)
    .innerJoin(productVariants, eq(productVariants.id, orderItems.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(eq(orderItems.orderId, orderId));

  const itemIds = itemRows.map((i) => i.id);

  const [attributeRows, returnedRows] = itemIds.length
    ? await Promise.all([
        db
          .select({
            variantId: variantAttributeValues.variantId,
            attributeName: attributes.name,
            value: attributeValues.value,
          })
          .from(variantAttributeValues)
          .innerJoin(attributeValues, eq(attributeValues.id, variantAttributeValues.attributeValueId))
          .innerJoin(attributes, eq(attributes.id, attributeValues.attributeId))
          .where(
            inArray(
              variantAttributeValues.variantId,
              itemRows.map((i) => i.variantId),
            ),
          ),
        db
          .select({ orderItemId: returns.orderItemId, returned: sum(returns.quantity) })
          .from(returns)
          .where(inArray(returns.orderItemId, itemIds))
          .groupBy(returns.orderItemId),
      ])
    : [[], []];

  const attributesByVariant = new Map<string, { attributeName: string; value: string }[]>();
  for (const row of attributeRows) {
    const list = attributesByVariant.get(row.variantId) ?? [];
    list.push({ attributeName: row.attributeName, value: row.value });
    attributesByVariant.set(row.variantId, list);
  }
  const returnedByItem = new Map(returnedRows.map((r) => [r.orderItemId, Number(r.returned ?? 0)]));

  const items: OrderDetailItem[] = itemRows.map((row) => {
    const returnedQuantity = returnedByItem.get(row.id) ?? 0;
    return {
      id: row.id,
      variantId: row.variantId,
      sku: row.sku,
      productName: row.productName,
      attributes: (attributesByVariant.get(row.variantId) ?? []).sort((a, b) =>
        a.attributeName.localeCompare(b.attributeName),
      ),
      quantity: row.quantity,
      unitPriceAtSale: Number(row.unitPriceAtSale),
      subtotal: Number(row.subtotal),
      returnedQuantity,
      returnableQuantity: row.quantity - returnedQuantity,
    };
  });

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    customerAddress: order.customerAddress,
    orderDate: order.orderDate,
    brand: { id: order.brandId, name: order.brandName, code: order.brandCode },
    items,
  };
}
