import { z } from "zod";

export const createMaterialCategorySchema = z.object({
  name: z.string().trim().min(1).max(100),
  code: z
    .string()
    .trim()
    .min(1)
    .max(10)
    .transform((v) => v.toUpperCase()),
});

export const createMaterialSchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  // Free text on purpose (see raw_materials.unit's comment in factory.ts) —
  // this list is just a starting-point suggestion for the frontend's select.
  unit: z.string().trim().min(1).max(20),
  reorderLevel: z.number().min(0).default(0),
  initialCostPerUnit: z.number().positive().optional(),
  initialStock: z
    .object({
      locationId: z.string().uuid(),
      quantity: z.number().positive(),
    })
    .optional(),
});
export type CreateMaterialInput = z.infer<typeof createMaterialSchema>;

export const updateMaterialSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    categoryId: z.string().uuid().optional(),
    unit: z.string().trim().min(1).max(20).optional(),
    reorderLevel: z.number().min(0).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "Provide at least one field to update" });
export type UpdateMaterialInput = z.infer<typeof updateMaterialSchema>;

export const updateMaterialCostSchema = z.object({
  costPerUnit: z.number().positive(),
});

const movementCommon = {
  notes: z.string().trim().max(1000).optional(),
  referenceType: z.enum(["work_order", "purchase", "manual"]).optional(),
  referenceId: z.string().uuid().optional(),
};

/** Mirrors chk_material_movement_locations in the migration — each movement type carries exactly the location(s) that check constraint requires. */
export const materialMovementSchema = z.discriminatedUnion("movementType", [
  z.object({ movementType: z.literal("receipt"), toLocationId: z.string().uuid(), quantity: z.number().positive(), ...movementCommon }),
  z.object({ movementType: z.literal("issue"), fromLocationId: z.string().uuid(), quantity: z.number().positive(), ...movementCommon }),
  z.object({ movementType: z.literal("return"), toLocationId: z.string().uuid(), quantity: z.number().positive(), ...movementCommon }),
  z.object({ movementType: z.literal("waste"), fromLocationId: z.string().uuid(), quantity: z.number().positive(), ...movementCommon }),
  // Sets the location's balance to an absolute new count (like the retail
  // module's setVariantStock) rather than a signed delta — simpler for a
  // stock-take correction, which is what this movement type is for.
  z.object({ movementType: z.literal("adjustment"), locationId: z.string().uuid(), newQuantity: z.number().min(0), ...movementCommon }),
]);
export type MaterialMovementInput = z.infer<typeof materialMovementSchema>;

export const createLocationSchema = z.object({
  name: z.string().trim().min(1).max(100),
  kind: z.enum(["raw_material", "wip", "finished_goods"]).default("raw_material"),
});
