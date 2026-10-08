import type OpenAI from "openai";

/** Pure helpers for the stored transcript — no DB or env access, so they're unit-testable on their own. */

export type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;
export type StoredRole = "user" | "assistant" | "tool";

/** An ai_messages row as read back: role column plus the JSONB content. */
export interface StoredMessage {
  role: StoredRole;
  content: unknown;
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .flatMap((part) => (part && typeof part === "object" && "text" in part && typeof part.text === "string" ? [part.text] : []))
      .join("\n\n");
  }
  return "";
}

/**
 * A stored row as a chat-completions message, ready to replay. Rows from
 * before the move off the Anthropic API hold an array of content blocks
 * instead of a message object; those come back as their plain text (their
 * tool calls can't be replayed in the new format, and aren't needed —
 * the text carries the conversation), or null when there's no text.
 */
export function toChatMessage(row: StoredMessage): ChatMessage | null {
  const content = row.content;
  if (content && typeof content === "object" && !Array.isArray(content) && "role" in content) {
    return content as ChatMessage;
  }
  if (row.role === "tool") return null;
  const text = textOf(content).trim();
  return text ? { role: row.role, content: text } : null;
}

/**
 * Attached receipts reach the chat model as text blocks appended to the
 * admin's message (see attachments.service.ts) and are stored that way, so
 * a replayed conversation carries them. The admin never sees the blocks —
 * the panel shows the file itself — so they're cut from the displayed text.
 */
const ATTACHMENT_BLOCK = /\s*<attachment id="[0-9a-f-]{36}">[\s\S]*?<\/attachment>/g;

export function attachmentBlock(attachmentId: string, body: string): string {
  // The body includes OCR output: a closing tag inside it would end the
  // block early and let the rest pass as the admin's own words.
  return `<attachment id="${attachmentId}">\n${body.replace(/<\/?attachment\b/gi, "(attachment")}\n</attachment>`;
}

/** The admin's message with its attachment blocks joined on — what the model gets. */
export function userMessageText(typed: string, blocks: string[]): string {
  return [typed.trim(), ...blocks].filter(Boolean).join("\n\n");
}

export function stripAttachmentBlocks(text: string): string {
  return text.replace(ATTACHMENT_BLOCK, "").trim();
}

/** Everything the assistant wrote during a turn, across its tool round-trips, as the admin saw it stream in. */
export function turnReplyText(messages: ChatMessage[]): string {
  return messages
    .flatMap((message) => (message.role === "assistant" ? [textOf(message.content).trim()] : []))
    .filter(Boolean)
    .join("\n\n");
}

/** What the UI shows for a tool call: its view and search phrase, if it has them ("trend", "statement: Cairo"). */
export function describeCall(rawArguments: string): string | undefined {
  try {
    const args = JSON.parse(rawArguments || "{}") as Record<string, unknown>;
    const parts = [args.view, args.query ?? args.search ?? args.name ?? args.orderNumber].filter(
      (part): part is string => typeof part === "string" && part.length > 0,
    );
    return parts.length > 0 ? parts.join(": ").slice(0, 80) : undefined;
  } catch {
    return undefined;
  }
}

/** The UI's view of a transcript row: what was said, and which tool calls (hence which draft cards) belong to it. */
export interface DisplayMessage {
  role: "user" | "assistant";
  text: string;
  toolCallIds: string[];
  /** The investigation steps behind an answer, in order — shown under it as "Checked: …". */
  toolSteps: { name: string; detail?: string }[];
}

export function toDisplayMessage(row: StoredMessage): DisplayMessage | null {
  const message = toChatMessage(row);
  if (!message || (message.role !== "user" && message.role !== "assistant")) return null;
  const calls = message.role === "assistant" && "tool_calls" in message && message.tool_calls ? message.tool_calls : [];
  const toolCallIds = calls.map((call) => call.id);
  const toolSteps = calls.flatMap((call) =>
    call.type === "function" ? [{ name: call.function.name, ...(describeCall(call.function.arguments) ? { detail: describeCall(call.function.arguments) } : {}) }] : [],
  );
  const text = textOf(message.content).trim();
  return { role: message.role, text: message.role === "user" ? stripAttachmentBlocks(text) : text, toolCallIds, toolSteps };
}

export const OMITTED_TOOL_RESULT =
  "(Earlier tool result omitted to save space. Its figures are not available: call the tool again if you need them, and never state a figure you can't see.)";

/**
 * The transcript as replayed to the model: the last `keepTurns` admin turns
 * in full, older tool results replaced by a stub, and anything before the
 * last `maxTurns` turns dropped. Every message is resent on every agent
 * step, so a long chat would otherwise crowd out the provider's per-minute
 * token budget with tool output nobody needs any more. The conversation
 * itself (what was asked and answered) is kept; only bulky data goes.
 *
 * A cut always lands on an admin message, so a tool result is never
 * separated from the assistant message that called it.
 */
export function compactHistory(messages: ChatMessage[], options: { keepTurns?: number; maxTurns?: number } = {}): ChatMessage[] {
  const keepTurns = options.keepTurns ?? 2;
  const maxTurns = options.maxTurns ?? 12;
  const userIndexes = messages.flatMap((message, index) => (message.role === "user" ? [index] : []));
  const start = userIndexes.length > maxTurns ? userIndexes[userIndexes.length - maxTurns]! : 0;
  const fullFrom = userIndexes.length > keepTurns ? userIndexes[userIndexes.length - keepTurns]! : 0;
  return messages.slice(start).map((message, offset) =>
    message.role === "tool" && start + offset < fullFrom ? { ...message, content: OMITTED_TOOL_RESULT } : message,
  );
}
