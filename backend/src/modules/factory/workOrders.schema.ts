import { z } from "zod";

export const createWorkOrderSchema = z.object({
  finishedGoodId: z.string().uuid(),
  bomId: z.string().uuid(),
  quantityOrdered: z.number().positive(),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  lineId: z.string().uuid().optional(),
  plannedStartDate: z.string().date().optional(),
  plannedEndDate: z.string().date().optional(),
  notes: z.string().trim().max(1000).optional(),
});
export type CreateWorkOrderInput = z.infer<typeof createWorkOrderSchema>;

export const updateWorkOrderStatusSchema = z.object({
  status: z.enum(["draft", "scheduled", "in_progress", "paused", "completed", "cancelled"]),
});

export const issueBomMaterialsSchema = z.object({
  fromLocationId: z.string().uuid(),
  notes: z.string().trim().max(500).optional(),
});
export type IssueBomMaterialsInput = z.infer<typeof issueBomMaterialsSchema>;

export const recordOutputSchema = z
  .object({
    stageId: z.string().uuid().optional(),
    quantityGood: z.number().min(0).default(0),
    quantityScrap: z.number().min(0).default(0),
    scrapReason: z.string().trim().max(200).optional(),
    // Where completed-good units land in Finished Goods Inventory — defaults
    // to the first "finished_goods"-kind location if omitted.
    locationId: z.string().uuid().optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .refine((data) => data.quantityGood > 0 || data.quantityScrap > 0, {
    message: "Enter a good quantity or a scrap quantity greater than zero",
    path: ["quantityGood"],
  });
export type RecordOutputInput = z.infer<typeof recordOutputSchema>;

export const recordLaborSchema = z.object({
  stageId: z.string().uuid().optional(),
  workerName: z.string().trim().min(1).max(150),
  hoursWorked: z.number().positive(),
  hourlyRate: z.number().min(0).optional(),
  quantityProduced: z.number().min(0).default(0),
  logDate: z.string().date().optional(),
  notes: z.string().trim().max(500).optional(),
});
export type RecordLaborInput = z.infer<typeof recordLaborSchema>;

export const recordQualityCheckSchema = z
  .object({
    stageId: z.string().uuid().optional(),
    checkedQuantity: z.number().positive(),
    passedQuantity: z.number().min(0),
    failedQuantity: z.number().min(0),
    result: z.enum(["pass", "fail", "rework"]),
    inspectorNotes: z.string().trim().max(1000).optional(),
  })
  .refine((data) => Math.abs(data.passedQuantity + data.failedQuantity - data.checkedQuantity) < 0.001, {
    message: "Passed + failed quantity must equal the checked quantity",
    path: ["passedQuantity"],
  });
export type RecordQualityCheckInput = z.infer<typeof recordQualityCheckSchema>;
