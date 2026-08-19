import { z } from "zod";

export const createReturnSchema = z
  .object({
    orderItemId: z.string().uuid(),
    quantity: z.number().int().positive(),
    reasonCodeId: z.string().uuid(),
    disposition: z.enum(["restock", "write_off"]),
    restockBinId: z.string().uuid().optional(),
    notes: z.string().trim().max(1000).optional(),
  })
  .refine((data) => (data.disposition === "restock" ? !!data.restockBinId : !data.restockBinId), {
    message: "restockBinId is required when disposition is 'restock', and must be omitted for 'write_off'",
    path: ["restockBinId"],
  });

export type CreateReturnInput = z.infer<typeof createReturnSchema>;

export const listReturnsQuerySchema = z.object({
  orderId: z.string().uuid().optional(),
  brandId: z.string().uuid().optional(),
});

export type ListReturnsQuery = z.infer<typeof listReturnsQuerySchema>;
