import { z } from "zod";
import type { ActionRow } from "../actions.service.js";
import type { AttachmentRow } from "../attachments.service.js";

export interface BrandRef {
  id: string;
  name: string;
  code: string;
}

/** Everything a tool needs to know about the turn it runs in — built once per chat request in chat.service.ts. */
export interface ToolContext {
  userId: string;
  conversationId: string;
  /** Every active workspace. Tools take a brand *code* (e.g. "ALH") rather than a uuid — short, readable, and far harder for the model to garble. */
  brands: BrandRef[];
  /** The workspace the chat was opened from — the default when the admin doesn't name one. Null on cross-brand pages. */
  activeBrand: BrandRef | null;
  /** Filled by the propose_* tools as they run, so the chat response can hand the UI its confirmation cards. */
  proposedActionIds: string[];
  /** Streaming: called the moment a draft is stored, so its card can appear before the reply finishes. */
  onActionProposed?: (action: ActionRow) => void;
  /** Receipts the admin attached in this conversation (this turn's included), by id — what a propose tool's attachmentId may name. */
  attachments: Map<string, AttachmentRow>;
  /** Knowledge citations handed out this turn ([K1], [K2]…) — numbered across searches so two searches never both have a K1. */
  knowledgeRefs: number;
}

/**
 * Thrown for a bad tool input the model can correct (unknown brand, missing
 * workspace). The tool runner turns any thrown error into an is_error
 * tool_result carrying this message, so it must read as an instruction to
 * the model, not a stack trace.
 */
export class ToolInputError extends Error {}

export const brandCodeField = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .optional()
  .describe("Workspace code, e.g. \"ALH\". Omit to use the admin's active workspace.");

export function resolveBrand(ctx: ToolContext, brandCode: string | undefined): BrandRef {
  if (!brandCode) {
    if (ctx.activeBrand) return ctx.activeBrand;
    throw new ToolInputError(
      `No active workspace — ask the admin which one they mean. Valid codes: ${ctx.brands.map((brand) => brand.code).join(", ")}`,
    );
  }
  const brand = ctx.brands.find((candidate) => candidate.code.toLowerCase() === brandCode.toLowerCase());
  if (!brand) {
    throw new ToolInputError(
      `Unknown workspace code "${brandCode}". Valid codes: ${ctx.brands.map((candidate) => candidate.code).join(", ")}`,
    );
  }
  return brand;
}

/** Tool results go back to the model as text; compact JSON keeps them small. */
export function toolJson(value: unknown): string {
  return JSON.stringify(value);
}

/** Money in tool results is rounded to piasters — float noise like 2000.0000000002 would otherwise reach the model and, from there, the admin. */
export function money(value: number): number {
  return Math.round(value * 100) / 100;
}

/** "3,500 EGP" — how amounts are written to the model and on cards. */
export function formatEgp(amount: number): string {
  return `${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })} EGP`;
}
