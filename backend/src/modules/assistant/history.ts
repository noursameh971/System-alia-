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

/** The UI's view of a transcript row: what was said, and which tool calls (hence which draft cards) belong to it. */
export interface DisplayMessage {
  role: "user" | "assistant";
  text: string;
  toolCallIds: string[];
}

export function toDisplayMessage(row: StoredMessage): DisplayMessage | null {
  const message = toChatMessage(row);
  if (!message || (message.role !== "user" && message.role !== "assistant")) return null;
  const toolCallIds =
    message.role === "assistant" && "tool_calls" in message && message.tool_calls
      ? message.tool_calls.map((call) => call.id)
      : [];
  const text = textOf(message.content).trim();
  return { role: message.role, text: message.role === "user" ? stripAttachmentBlocks(text) : text, toolCallIds };
}
