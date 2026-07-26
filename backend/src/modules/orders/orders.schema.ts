import { z } from "zod";

const orderItemInputSchema = z.object({
  variantId: z.string().uuid(),
  binId: z.string().uuid(),
  quantity: z.number().int().positive(),
});

export const createOrderSchema = z.object({
  brandId: z.string().uuid(),
  customerName: z.string().trim().min(1).max(150).optional(),
  customerPhone: z.string().trim().max(30).optional(),
  customerAddress: z.string().trim().max(2000).optional(),
  items: z.array(orderItemInputSchema).min(1, "An order needs at least one item"),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const listOrdersQuerySchema = z.object({
  brandId: z.string().uuid().optional(),
  status: z.enum(["pending", "processing", "shipped", "delivered", "cancelled"]).optional(),
});

export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;
