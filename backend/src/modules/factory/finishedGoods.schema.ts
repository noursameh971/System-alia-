import { z } from "zod";

/**
 * Ships finished-goods stock out to a retail brand. This is the module's one
 * deliberate "clean data hook" into the brand side per the architectural
 * rule: it never touches a brand's own tables — it only records that stock
 * left the factory, tagged with the brand's id via the same loose
 * (referenceType, referenceId) pair finished_goods_movements already uses
 * for work-order references, not a foreign key.
 */
export const shipFinishedGoodSchema = z.object({
  brandId: z.string().uuid(),
  fromLocationId: z.string().uuid(),
  quantity: z.number().positive(),
  notes: z.string().trim().max(500).optional(),
});
export type ShipFinishedGoodInput = z.infer<typeof shipFinishedGoodSchema>;
