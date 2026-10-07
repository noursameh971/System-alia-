import { z } from "zod";

export const conversationIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const statusQuerySchema = z.object({
  /** ?verify=true also round-trips to the Anthropic API to prove the key and model work. */
  verify: z.enum(["true", "false"]).optional(),
});

export const chatBodySchema = z.object({
  /** Omit to start a new conversation. */
  conversationId: z.string().uuid().optional(),
  /** The workspace the chat is open in — the tools' default brand. null on cross-brand pages; omit to keep the conversation's. */
  brandId: z.string().uuid().nullable().optional(),
  message: z.string().trim().min(1, "Message is required").max(4000),
});

export type ChatBody = z.infer<typeof chatBodySchema>;

export const actionIdParamSchema = z.object({
  id: z.string().uuid(),
});

/** A Confirm with no edits may send no body at all. */
export const confirmActionBodySchema = z
  .object({
    /** Edits the admin made on the confirmation card; validated per action kind in actions.service.ts. */
    overrides: z.record(z.string(), z.unknown()).optional(),
  })
  .default({});
