import { z } from "zod";

export const listReasonCodesQuerySchema = z.object({
  appliesTo: z.enum(["stock_movement", "return"]).optional(),
});
