import { z } from "zod";

export const listInventoryQuerySchema = z.object({
  brandId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  zoneId: z.string().uuid().optional(),
  binId: z.string().uuid().optional(),
});

export type ListInventoryQuery = z.infer<typeof listInventoryQuerySchema>;
