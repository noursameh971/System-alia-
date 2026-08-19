/**
 * Excel export/import for the Orders page. Import goes through createOrder
 * (orders.service.ts) — the exact same transactional path a manually placed
 * order uses (brand/price validation, atomic stock decrement, audit trail) —
 * so bulk-imported orders can't bypass those rules to write faster. Follow-up
 * order date / status overrides (see below) go through the same public
 * update entry points the Orders page itself uses.
 */
import { asc, eq } from "drizzle-orm";
import xlsx from "xlsx";
import { db } from "../../db/client.js";
import { brands, orderItems, orders, productVariants } from "../../db/schema/index.js";
import { ApiError } from "../../utils/apiError.js";
import { getInventoryForVariant } from "../inventory/inventory.service.js";
import { getVariantBySku } from "../products/products.service.js";
import { ORDER_PAYMENT_METHOD_VALUES, ORDER_STATUS_VALUES, type CreateOrderInput } from "./orders.schema.js";
import { createOrder, updateOrderStatus } from "./orders.service.js";

const EXPORT_HEADERS = [
  "Order Ref",
  "Order Date",
  "Customer Name",
  "Customer Phone",
  "Customer Address",
  "Payment Method",
  "Status",
  "SKU",
  "Quantity",
  "Unit Price",
  "Subtotal",
  "Shipping Fee",
] as const;

/**
 * One row per order item, newest orders first — matches the shape
 * importOrderRows expects (grouped back up by "Order Ref"), so a
 * round-tripped export re-imports as equivalent new orders. Re-importing an
 * exported sheet does NOT update the original orders — see importOrderRows.
 */
export async function exportOrdersWorkbook(brandId?: string): Promise<Buffer> {
  const rows = await db
    .select({
      orderNumber: orders.orderNumber,
      orderDate: orders.orderDate,
      customerName: orders.customerName,
      customerPhone: orders.customerPhone,
      customerAddress: orders.customerAddress,
      paymentMethod: orders.paymentMethod,
      status: orders.status,
      shippingFee: orders.shippingFee,
      sku: productVariants.sku,
      quantity: orderItems.quantity,
      unitPrice: orderItems.unitPriceAtSale,
      subtotal: orderItems.subtotal,
    })
    .from(orders)
    .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .innerJoin(productVariants, eq(productVariants.id, orderItems.variantId))
    .where(brandId ? eq(orders.brandId, brandId) : undefined)
    .orderBy(asc(orders.orderNumber));

  const sheetRows = rows.map((r) => ({
    "Order Ref": r.orderNumber,
    "Order Date": r.orderDate.toISOString().slice(0, 10),
    "Customer Name": r.customerName ?? "",
    "Customer Phone": r.customerPhone ?? "",
    "Customer Address": r.customerAddress ?? "",
    "Payment Method": r.paymentMethod,
    Status: r.status,
    SKU: r.sku,
    Quantity: r.quantity,
    "Unit Price": r.unitPrice,
    Subtotal: r.subtotal,
    "Shipping Fee": r.shippingFee,
  }));

  const worksheet = xlsx.utils.json_to_sheet(sheetRows, { header: [...EXPORT_HEADERS] });
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, "Orders");
  return xlsx.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

interface ParsedOrderRow {
  rowNumber: number;
  orderRef: string;
  orderDateRaw: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  paymentMethodRaw: string;
  statusRaw: string;
  shippingFeeRaw: string;
  sku: string;
  quantityRaw: string;
}

function cell(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

/**
 * Reads the first sheet into rows keyed by the same headers
 * exportOrdersWorkbook writes. A blank "Order Ref" cell carries forward the
 * previous non-blank ref — the same multi-line-order convention Shopify's
 * own order CSV export uses — so a spreadsheet only has to name the order
 * once and list one SKU/Quantity per line after it.
 */
function parseImportWorkbook(buffer: Buffer): ParsedOrderRow[] {
  let workbook: ReturnType<typeof xlsx.read>;
  try {
    workbook = xlsx.read(buffer, { type: "buffer" });
  } catch {
    throw ApiError.badRequest("Couldn't read that file — is it a valid .xlsx workbook?");
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw ApiError.badRequest("The workbook has no sheets");
  const sheet = workbook.Sheets[sheetName]!;
  const raw = xlsx.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  let lastRef = "";
  return raw.map((r, i) => {
    const ref = cell(r["Order Ref"]);
    if (ref) lastRef = ref;
    return {
      rowNumber: i + 2, // header is row 1 in the sheet
      orderRef: ref || lastRef,
      orderDateRaw: cell(r["Order Date"]),
      customerName: cell(r["Customer Name"]),
      customerPhone: cell(r["Customer Phone"]),
      customerAddress: cell(r["Customer Address"]),
      paymentMethodRaw: cell(r["Payment Method"]).toLowerCase(),
      statusRaw: cell(r["Status"]).toLowerCase(),
      shippingFeeRaw: cell(r["Shipping Fee"]),
      sku: cell(r["SKU"]),
      quantityRaw: cell(r["Quantity"]),
    };
  });
}

export interface ImportRowError {
  row: number;
  message: string;
}

export interface ImportOrdersResult {
  totalRows: number;
  ordersCreated: number;
  itemsImported: number;
  skipped: number;
  errors: ImportRowError[];
}

function parseQuantity(raw: string): number {
  const value = Number(raw);
  if (!raw || Number.isNaN(value) || value <= 0 || !Number.isInteger(value)) {
    throw new Error(`Invalid quantity "${raw}"`);
  }
  return value;
}

function parseShippingFee(raw: string): number {
  if (!raw) return 0;
  const value = Number(raw);
  if (Number.isNaN(value) || value < 0) throw new Error(`Invalid Shipping Fee "${raw}"`);
  return value;
}

function parsePaymentMethod(raw: string): "cod" | "online" {
  if (!raw) return "cod";
  if ((ORDER_PAYMENT_METHOD_VALUES as readonly string[]).includes(raw)) {
    return raw as "cod" | "online";
  }
  throw new Error(`Invalid Payment Method "${raw}" — expected "cod" or "online"`);
}

type OrderStatus = (typeof ORDER_STATUS_VALUES)[number];

function parseStatus(raw: string): OrderStatus | undefined {
  if (!raw) return undefined;
  if ((ORDER_STATUS_VALUES as readonly string[]).includes(raw)) return raw as OrderStatus;
  throw new Error(`Invalid Status "${raw}" — expected one of ${ORDER_STATUS_VALUES.join(", ")}`);
}

/** Returns a Date if the cell holds a plausible date, undefined if blank, or throws if unparseable. */
function parseOrderDate(raw: string): Date | undefined {
  if (!raw) return undefined;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid Order Date "${raw}"`);
  return parsed;
}

/**
 * Picks the single bin holding the most stock for this variant, as long as
 * it can cover the requested quantity outright — bulk-imported orders don't
 * try to split one line across multiple bins. This is only a placement
 * hint: createOrder's underlying atomic stock check (recordOutboundMovementInTx)
 * is still what actually guards against overselling, including the case
 * where stock changes between this check and the write below.
 */
async function pickBinForVariant(variantId: string, quantity: number): Promise<string | null> {
  const bins = await getInventoryForVariant(variantId);
  const candidates = bins.filter((b) => b.quantity >= quantity).sort((a, b) => b.quantity - a.quantity);
  return candidates[0]?.binId ?? null;
}

/**
 * Imports rows from an uploaded .xlsx: rows sharing an "Order Ref" become
 * one order, each becoming a call to createOrder — so import always CREATES
 * new orders (unlike Products import, there's no "match an existing order
 * and update it" concept; orders are immutable financial history once
 * placed). Customer/payment/date/status fields are read from each group's
 * first row only. A bad order doesn't abort the rest of the file — each
 * group runs independently and a failure is recorded in `errors` against
 * that group's first row.
 */
export async function importOrderRows(buffer: Buffer, brandId: string, actorUserId: string): Promise<ImportOrdersResult> {
  const [brand] = await db.select({ id: brands.id }).from(brands).where(eq(brands.id, brandId)).limit(1);
  if (!brand) throw ApiError.badRequest(`Brand ${brandId} does not exist`);

  const rows = parseImportWorkbook(buffer);
  const result: ImportOrdersResult = { totalRows: rows.length, ordersCreated: 0, itemsImported: 0, skipped: 0, errors: [] };

  const groups = new Map<string, ParsedOrderRow[]>();
  for (const row of rows) {
    if (!row.orderRef && !row.sku) {
      result.skipped++;
      continue;
    }
    if (!row.orderRef) {
      result.errors.push({ row: row.rowNumber, message: "Row has a SKU but no Order Ref (and no previous row to inherit one from)" });
      continue;
    }
    const list = groups.get(row.orderRef) ?? [];
    list.push(row);
    groups.set(row.orderRef, list);
  }

  for (const groupRows of groups.values()) {
    const first = groupRows[0]!;
    try {
      const paymentMethod = parsePaymentMethod(first.paymentMethodRaw);
      const status = parseStatus(first.statusRaw);
      const orderDate = parseOrderDate(first.orderDateRaw);
      const shippingFee = parseShippingFee(first.shippingFeeRaw);

      const items: CreateOrderInput["items"] = [];
      for (const row of groupRows) {
        if (!row.sku) throw new Error(`Order "${row.orderRef}" has a line with no SKU`);
        const quantity = parseQuantity(row.quantityRaw);

        const variant = await getVariantBySku(row.sku);
        if (!variant) throw new Error(`SKU "${row.sku}" doesn't match any existing variant`);
        if (variant.brand.id !== brandId) {
          throw new Error(`SKU "${row.sku}" belongs to a different brand (${variant.brand.name})`);
        }

        const binId = await pickBinForVariant(variant.id, quantity);
        if (!binId) throw new Error(`Insufficient stock for SKU "${row.sku}": no single bin holds ${quantity} units`);

        items.push({ variantId: variant.id, binId, quantity });
      }

      const input: CreateOrderInput = {
        brandId,
        customerName: first.customerName || undefined,
        customerPhone: first.customerPhone || undefined,
        customerAddress: first.customerAddress || undefined,
        paymentMethod,
        shippingFee,
        items,
      };

      const created = await createOrder(input, actorUserId);

      if (orderDate) {
        await db.update(orders).set({ orderDate }).where(eq(orders.id, created.id));
      }
      if (status && status !== created.status) {
        await updateOrderStatus(created.id, status);
      }

      result.ordersCreated++;
      result.itemsImported += items.length;
    } catch (err) {
      const rowSpan = groupRows.length > 1 ? `rows ${first.rowNumber}-${groupRows[groupRows.length - 1]!.rowNumber}` : `row ${first.rowNumber}`;
      const message = err instanceof Error ? err.message : "Unknown error";
      result.errors.push({ row: first.rowNumber, message: `Order "${first.orderRef}" (${rowSpan}): ${message}` });
    }
  }

  return result;
}
