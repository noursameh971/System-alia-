import type { ChatMessage } from "./history.js";
import { OMITTED_TOOL_RESULT } from "./history.js";

/**
 * Keeps each model request inside the provider's per-minute token budget.
 *
 * Groq counts a request as prompt + max_completion_tokens up front and
 * refuses outright (413) any single request bigger than the per-minute
 * limit — 8,000 tokens on its free tier. An agent turn grows with every
 * tool result, so without this a 4th or 5th step fails however simple the
 * question. Before each step: estimate the prompt, give the reply whatever
 * room is left (within bounds), and if that's too little, shorten the
 * bulkiest earlier tool results of this turn (the latest step's results
 * stay whole — they're what the model is about to read).
 *
 * Shortened, not erased: in testing, a model whose earlier results were
 * replaced by a stub filled the gap with invented figures. A result is
 * first cut to its head, with an explicit instruction not to state
 * anything it can't see; only if that still doesn't fit is it removed.
 *
 * Pure (estimates, no API call), so it's unit-testable.
 */

/**
 * Characters per token, measured against Groq's own counts for gpt-oss
 * (system prompt 4.3, tool definitions 5.3 — the provider re-encodes
 * schemas compactly) and rounded down for safety, since tool results are
 * JSON and Arabic text tokenizes denser than English prose.
 */
const MESSAGE_CHARS_PER_TOKEN = 3.3;
const TOOL_CHARS_PER_TOKEN = 5;
const MIN_COMPLETION = 700;
const SHORTENED_RESULT_CHARS = 900;
const SHORTENED_NOTE =
  "[The rest of this result was cut to fit the model's per-minute limit. Never state a figure that isn't visible here — call the tool again (narrower: one period, one name) for anything missing.]";
const SAFETY_MARGIN = 300;

export function estimateTokens(messages: ChatMessage[], toolsJson: string): number {
  return Math.ceil(JSON.stringify(messages).length / MESSAGE_CHARS_PER_TOKEN + toolsJson.length / TOOL_CHARS_PER_TOKEN);
}

export interface FittedRequest {
  messages: ChatMessage[];
  maxCompletionTokens: number;
  /** How many earlier tool results of this turn were stubbed to fit. */
  compacted: number;
}

/**
 * `messages` = everything for the request; `turnStart` = index of the first
 * message added during this turn (earlier ones were compacted already by
 * compactHistory). Tool results in [turnStart, lastStepStart) may be stubbed.
 */
export function fitToBudget(
  messages: ChatMessage[],
  toolsJson: string,
  options: {
    tokensPerMinute: number;
    maxCompletion: number;
    turnStart: number;
    /** Provider tokens per estimated token, learned from real usage (see learnCalibration). Models count very differently. */
    calibration?: number;
  },
): FittedRequest {
  const factor = options.calibration ?? 1;
  const room = (list: ChatMessage[]) => options.tokensPerMinute - SAFETY_MARGIN - Math.ceil(estimateTokens(list, toolsJson) * factor);
  let current = messages;
  let compacted = 0;

  if (room(current) < MIN_COMPLETION) {
    // The latest step = the last assistant message with tool calls, and its results after it.
    let lastStepStart = current.length;
    for (let index = current.length - 1; index >= options.turnStart; index--) {
      const message = current[index]!;
      if (message.role === "assistant" && "tool_calls" in message && message.tool_calls?.length) {
        lastStepStart = index;
        break;
      }
    }
    // Biggest first: one large listing usually frees enough on its own.
    const candidates = current
      .map((message, index) => ({ message, index }))
      .filter(({ message, index }) => message.role === "tool" && index >= options.turnStart && index < lastStepStart && message.content !== OMITTED_TOOL_RESULT)
      .sort((a, b) => String(b.message.content).length - String(a.message.content).length);
    current = [...current];
    const replace = (index: number, content: string) => {
      current[index] = { ...(current[index] as Extract<ChatMessage, { role: "tool" }>), content };
    };
    // Pass 1: cut to the head. Pass 2 (only if still too big): remove.
    for (const { index, message } of candidates) {
      if (room(current) >= MIN_COMPLETION) break;
      const text = String(message.content);
      if (text.length <= SHORTENED_RESULT_CHARS) continue;
      replace(index, `${text.slice(0, SHORTENED_RESULT_CHARS)}… ${SHORTENED_NOTE}`);
      compacted++;
    }
    for (const { index } of candidates) {
      if (room(current) >= MIN_COMPLETION) break;
      replace(index, OMITTED_TOOL_RESULT);
      compacted++;
    }
  }

  return {
    messages: current,
    // Never below the floor: if even that doesn't fit, the request goes as
    // is and the provider's 413 becomes "start a new chat" (toApiError).
    maxCompletionTokens: Math.max(MIN_COMPLETION, Math.min(options.maxCompletion, room(current))),
    compacted,
  };
}

/**
 * Provider tokens per estimated token, per model. The same prompt and tools
 * cost 3.9k tokens on gpt-oss-120b and 5.7k on qwen3.8 (each renders tool
 * schemas its own way), so one fixed ratio is wrong for some model.
 * Every step's real usage refines it; a model not seen yet starts
 * pessimistic, so its first request isn't the one that's too big.
 */
const calibrations = new Map<string, number>();
const UNSEEN_MODEL_CALIBRATION = 1.6;

export function calibrationFor(model: string): number {
  return calibrations.get(model) ?? UNSEEN_MODEL_CALIBRATION;
}

export function learnCalibration(model: string, estimatedTokens: number, actualPromptTokens: number): void {
  if (estimatedTokens <= 0 || actualPromptTokens <= 0) return;
  const observed = actualPromptTokens / estimatedTokens;
  const previous = calibrations.get(model);
  // Leans on the latest observation, but rounds up: underestimating is what fails.
  calibrations.set(model, previous === undefined ? observed * 1.05 : Math.max(observed, (previous + observed) / 2) * 1.05);
}

/** "...Limit 8000, Requested 8231..." in a provider's 413 → how many tokens to shed, or null if it doesn't say. */
export function overBudgetBy(message: string): number | null {
  const limit = /Limit\s*:?\s*(\d+)/i.exec(message);
  const requested = /Requested\s*:?\s*(\d+)/i.exec(message);
  if (!limit || !requested) return null;
  const over = Number(requested[1]) - Number(limit[1]);
  return over > 0 ? over : null;
}
