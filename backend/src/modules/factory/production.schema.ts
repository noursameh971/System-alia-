import { z } from "zod";

export const createProductionLineSchema = z.object({
  name: z.string().trim().min(1).max(100),
  code: z.string().trim().min(1).max(20).transform((v) => v.toUpperCase()),
  description: z.string().trim().max(500).optional(),
});

export const createMachineSchema = z.object({
  name: z.string().trim().min(1).max(100),
  code: z.string().trim().min(1).max(30),
  lineId: z.string().uuid().optional(),
  machineType: z.string().trim().max(60).optional(),
  purchaseDate: z.string().date().optional(),
  notes: z.string().trim().max(500).optional(),
});

export const updateMachineStatusSchema = z.object({
  status: z.enum(["idle", "running", "maintenance", "down"]),
});

export const createStageTemplateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  defaultSequenceOrder: z.number().int().min(0).default(0),
  defaultLineId: z.string().uuid().optional(),
});
