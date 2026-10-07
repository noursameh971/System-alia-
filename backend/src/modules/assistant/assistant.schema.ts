import { z } from "zod";
import { MAX_ATTACHMENTS_PER_MESSAGE } from "./attachments.service.js";

export const conversationIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const statusQuerySchema = z.object({
  /** ?verify=true also round-trips to the model API to prove the key and model work. */
  verify: z.enum(["true", "false"]).optional(),
});

export const chatBodySchema = z
  .object({
    /** Omit to start a new conversation. */
    conversationId: z.string().uuid().optional(),
    /** The workspace the chat is open in — the tools' default brand. null on cross-brand pages; omit to keep the conversation's. */
    brandId: z.string().uuid().nullable().optional(),
    message: z.string().trim().max(4000).default(""),
    /** Files uploaded via POST /attachments, sent with this message. */
    attachmentIds: z
      .array(z.string().uuid())
      .max(MAX_ATTACHMENTS_PER_MESSAGE, `Attach up to ${MAX_ATTACHMENTS_PER_MESSAGE} files per message`)
      .default([]),
    /** The panel's UI language — the reply language when the message itself has no words to tell from (a receipt sent on its own). */
    locale: z.enum(["en", "ar"]).optional(),
  })
  .refine((body) => body.message.length > 0 || body.attachmentIds.length > 0, {
    message: "Message is required",
    path: ["message"],
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
