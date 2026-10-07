import type Anthropic from "@anthropic-ai/sdk";

/** Pure helpers for the stored transcript — no DB or env access, so they're unit-testable on their own. */

type MessageParam = Anthropic.Beta.Messages.BetaMessageParam;
type ContentBlockParam = Anthropic.Beta.Messages.BetaContentBlockParam;

function asBlocks(content: MessageParam["content"]): ContentBlockParam[] {
  return typeof content === "string" ? [{ type: "text", text: content }] : content;
}

/**
 * The API expects user/assistant turns to alternate. A turn stopped at the
 * tool-iteration cap ends on a tool_result (user) message, so the next
 * user message would make two in a row — merge them here, at request time,
 * rather than rewriting stored history.
 */
export function mergeConsecutiveRoles(messages: MessageParam[]): MessageParam[] {
  const merged: MessageParam[] = [];
  for (const message of messages) {
    const previous = merged.at(-1);
    if (previous && previous.role === message.role) {
      merged[merged.length - 1] = { role: previous.role, content: [...asBlocks(previous.content), ...asBlocks(message.content)] };
    } else {
      merged.push(message);
    }
  }
  return merged;
}

/**
 * Everything the assistant wrote during a turn, across its tool round-trips
 * ("Let me check October." … "You spent 3,000 EGP."), as the admin saw it
 * stream in.
 */
export function turnReplyText(messages: MessageParam[]): string {
  return messages
    .filter((message) => message.role === "assistant")
    .flatMap((message) => asBlocks(message.content))
    .flatMap((block) => (block.type === "text" && block.text.trim() ? [block.text.trim()] : []))
    .join("\n\n");
}

