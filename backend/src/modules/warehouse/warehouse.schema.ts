import { z } from "zod";

export const createWarehouseSchema = z.object({
  name: z.string().trim().min(1).max(100),
  address: z.string().trim().max(2000).optional(),
});

export const createZoneSchema = z.object({
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().max(100).optional(),
});

export const createBinSchema = z.object({
  code: z.string().trim().min(1).max(20),
});

export type CreateWarehouseInput = z.infer<typeof createWarehouseSchema>;
export type CreateZoneInput = z.infer<typeof createZoneSchema>;
export type CreateBinInput = z.infer<typeof createBinSchema>;
