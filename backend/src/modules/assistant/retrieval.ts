import { env } from "../../config/env.js";
import { searchKnowledge } from "../knowledge/search.service.js";
import type { ToolContext } from "./tools/context.js";

/**
 * Pre-retrieval: before the model runs, the knowledge base is searched with
 * the admin's message and the confident matches are put in the turn
 * context. It saves a whole agent step (and its tokens) whenever the
 * answer is in a document or a past record, and it's how the model learns
 * that something relevant exists at all.
 *
 * Kept deliberately small — a few short snippets, and only above a
 * similarity bar — because it's added to every model call of the turn
 * whether or not it's needed; the model can still call search_knowledge
 * for more.
 */

const MAX_HITS = 3;
const MAX_SNIPPET_CHARS = 350;
/**
 * Cosine similarity (EmbeddingGemma, 384 dims) a hit must reach to be
 * included unasked. Calibrated on the knowledge test set: questions the
 * index answers scored 0.50–0.76 on their best hit; unrelated messages
 * ("I spent 2000 for the lawyer", "what's low on stock?") 0.16–0.44, the
 * top of that being "weather in Cairo" brushing "Cairo Fabrics".
 */
export const PRE_RETRIEVAL_MIN_SIMILARITY = 0.47;

/** Replies like "yes", "confirm it", "the second one" carry nothing to search for. */
function worthSearching(message: string): boolean {
  return message.trim().split(/\s+/).filter((word) => word.length > 1).length >= 3;
}

export async function retrieveForMessage(message: string, ctx: ToolContext): Promise<{ ref: string; title: string; text: string }[]> {
  if (!env.KNOWLEDGE_ENABLED || !worthSearching(message)) return [];
  try {
    const hits = await searchKnowledge(message, { brandId: ctx.activeBrand?.id ?? null, limit: MAX_HITS * 2 });
    return hits
      .filter((hit) => (hit.similarity ?? 0) >= PRE_RETRIEVAL_MIN_SIMILARITY)
      .slice(0, MAX_HITS)
      .map((hit) => ({
        ref: `K${++ctx.knowledgeRefs}`,
        title: hit.title,
        text: hit.content.length > MAX_SNIPPET_CHARS ? `${hit.content.slice(0, MAX_SNIPPET_CHARS)}…` : hit.content,
      }));
  } catch (err) {
    // The turn still works without it — the model can search, or answer from the data tools.
    console.error("Assistant: pre-retrieval failed:", err instanceof Error ? err.message : err);
    return [];
  }
}
