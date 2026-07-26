import { z } from "zod";

const referenceFields = {
  referenceType: z.enum(["order", "return", "manual", "purchase"]).optional(),
  referenceId: z.string().uuid().optional(),
  notes: z.string().trim().max(1000).optional(),
};

export const inboundMovementSchema = z.object({
  variantId: z.string().uuid(),
  binId: z.string().uuid(),
  quantity: z.number().int().positive(),
  ...referenceFields,
});

export const outboundMovementSchema = z.object({
  variantId: z.string().uuid(),
  binId: z.string().uuid(),
  quantity: z.number().int().positive(),
  ...referenceFields,
});

export const transferMovementSchema = z
  .object({
    variantId: z.string().uuid(),
    fromBinId: z.string().uuid(),
    toBinId: z.string().uuid(),
    quantity: z.number().int().positive(),
    notes: z.string().trim().max(1000).optional(),
  })
  .refine((data) => data.fromBinId !== data.toBinId, {
    message: "fromBinId and toBinId must be different bins",
    path: ["toBinId"],
  });

export const returnMovementSchema = z.object({
  variantId: z.string().uuid(),
  binId: z.string().uuid(), // restock destination
  quantity: z.number().int().positive(),
  reasonCodeId: z.string().uuid(),
  ...referenceFields,
});

export type InboundMovementInput = z.infer<typeof inboundMovementSchema>;
export type OutboundMovementInput = z.infer<typeof outboundMovementSchema>;
export type TransferMovementInput = z.infer<typeof transferMovementSchema>;
export type ReturnMovementInput = z.infer<typeof returnMovementSchema>;
