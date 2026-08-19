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

// binId/reasonCodeId are optional here (unlike the original required shape)
// so this same schema covers both a restock return (binId set — stock goes
// back into that bin) and a Damaged/Lost audit-only return (binId omitted —
// logged for the record but never touches inventory). See
// recordReturnMovementInTx's doc comment for the full rationale.
export const returnMovementSchema = z.object({
  variantId: z.string().uuid(),
  binId: z.string().uuid().optional(), // restock destination; omit for a damaged/lost audit entry
  quantity: z.number().int().positive(),
  reasonCodeId: z.string().uuid().optional(),
  ...referenceFields,
});

export type InboundMovementInput = z.infer<typeof inboundMovementSchema>;
export type OutboundMovementInput = z.infer<typeof outboundMovementSchema>;
export type TransferMovementInput = z.infer<typeof transferMovementSchema>;
export type ReturnMovementInput = z.infer<typeof returnMovementSchema>;

// The Inventory page's Batch Scan Queue: one shared bin/condition context
// per execution, applied to every scanned line item in a single transaction.
const batchItemSchema = z.object({
  variantId: z.string().uuid(),
  quantity: z.number().int().positive(),
});

export const batchMovementSchema = z.discriminatedUnion("movementType", [
  z.object({
    movementType: z.literal("inbound"),
    toBinId: z.string().uuid(),
    items: z.array(batchItemSchema).min(1, "Scan at least one item"),
  }),
  z.object({
    movementType: z.literal("outbound"),
    fromBinId: z.string().uuid(),
    items: z.array(batchItemSchema).min(1, "Scan at least one item"),
  }),
  z
    .object({
      movementType: z.literal("transfer"),
      fromBinId: z.string().uuid(),
      toBinId: z.string().uuid(),
      items: z.array(batchItemSchema).min(1, "Scan at least one item"),
    })
    .refine((data) => data.fromBinId !== data.toBinId, {
      message: "fromBinId and toBinId must be different bins",
      path: ["toBinId"],
    }),
  z
    .object({
      movementType: z.literal("return"),
      condition: z.enum(["good", "damaged"]),
      toBinId: z.string().uuid().optional(), // required when condition is "good"
      reason: z.string().trim().max(500).optional(),
      items: z.array(batchItemSchema).min(1, "Scan at least one item"),
    })
    .refine((data) => data.condition !== "good" || Boolean(data.toBinId), {
      message: "A restock bin is required when condition is Salable / Good Condition",
      path: ["toBinId"],
    }),
]);

export type BatchMovementInput = z.infer<typeof batchMovementSchema>;
