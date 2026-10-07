import { z } from "zod";

export const conversationIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const statusQuerySchema = z.object({
  /** ?verify=true also round-trips to the Anthropic API to prove the key and model work. */
  verify: z.enum(["true", "false"]).optional(),
});
