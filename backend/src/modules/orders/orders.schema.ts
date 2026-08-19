import { z } from "zod";

const orderItemInputSchema = z.object({
  variantId: z.string().uuid(),
  binId: z.string().uuid(),
  quantity: z.number().int().positive(),
});

export const ORDER_STATUS_VALUES = ["pending", "processing", "shipped", "delivered", "cancelled"] as const;
export const ORDER_PAYMENT_METHOD_VALUES = ["cod", "online"] as const;
const orderStatusValues = ORDER_STATUS_VALUES;

export const createOrderSchema = z.object({
  brandId: z.string().uuid(),
  customerName: z.string().trim().min(1).max(150).optional(),
  customerPhone: z.string().trim().max(30).optional(),
  customerAddress: z.string().trim().max(2000).optional(),
  paymentMethod: z.enum(ORDER_PAYMENT_METHOD_VALUES).default("cod"),
  shippingFee: z.number().min(0).default(0),
  items: z.array(orderItemInputSchema).min(1, "An order needs at least one item"),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const listOrdersQuerySchema = z.object({
  brandId: z.string().uuid().optional(),
  status: z.enum(orderStatusValues).optional(),
});

export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;

export const updateOrderStatusSchema = z.object({
  status: z.enum(orderStatusValues),
});

export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
