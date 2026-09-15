import { z } from "zod";

export const createFinishedGoodSchema = z.object({
  name: z.string().trim().min(1).max(200),
  unit: z.string().trim().min(1).max(20).default("piece"),
  linkedVariantId: z.string().uuid().optional(),
});
export type CreateFinishedGoodInput = z.infer<typeof createFinishedGoodSchema>;

const bomLineSchema = z.object({
  materialId: z.string().uuid(),
  quantityPerBatch: z.number().positive(),
  wasteAllowancePct: z.number().min(0).max(100).default(0),
  sequenceOrder: z.number().int().min(0).default(0),
  notes: z.string().trim().max(500).optional(),
});

const bomStageSchema = z.object({
  stageTemplateId: z.string().uuid(),
  sequenceOrder: z.number().int().min(0),
  standardTimeMinutes: z.number().positive().optional(),
  defaultLineId: z.string().uuid().optional(),
});

export const createBomSchema = z.object({
  finishedGoodId: z.string().uuid(),
  label: z.string().trim().max(100).optional(),
  outputQuantity: z.number().positive().default(1),
  notes: z.string().trim().max(1000).optional(),
  lines: z.array(bomLineSchema).min(1, "A BOM needs at least one material line"),
  stages: z.array(bomStageSchema).default([]),
});
export type CreateBomInput = z.infer<typeof createBomSchema>;

export const updateBomStatusSchema = z.object({
  status: z.enum(["draft", "active", "archived"]),
});

export const materialRequirementsQuerySchema = z.object({
  quantityOrdered: z.coerce.number().positive(),
});
