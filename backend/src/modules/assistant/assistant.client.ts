import OpenAI from "openai";
import { env } from "../../config/env.js";
import { ApiError } from "../../utils/apiError.js";

/**
 * The one place the backend talks to the language model: any
 * OpenAI-compatible chat-completions API (Groq by default — see
 * ASSISTANT_BASE_URL). The key lives only in the backend's env — the
 * browser never sees it, and every call is made on behalf of an
 * already-authenticated admin (see assistant.routes.ts).
 */

let client: OpenAI | null = null;

export function isAssistantEnabled(): boolean {
  return Boolean(env.ASSISTANT_KEY);
}

export function getModelClient(): OpenAI {
  if (!env.ASSISTANT_KEY) {
    throw ApiError.serviceUnavailable("The assistant isn't configured on this server (GROQ_API_KEY is not set)");
  }
  // Built lazily so a server without a key still boots, and only once so
  // every request shares the SDK's connection pool. Timeout is in ms. Four
  // retries (429/5xx/connection errors, honouring retry-after) because
  // Groq's per-minute token limits are tight on lower tiers and a chat turn
  // makes several calls in quick succession.
  client ??= new OpenAI({ apiKey: env.ASSISTANT_KEY, baseURL: env.ASSISTANT_BASE_URL, timeout: 120_000, maxRetries: 4 });
  return client;
}

export type ConnectionCheck = { ok: true; model: string; displayName: string } | { ok: false; model: string; reason: string };

/**
 * Confirms the key is accepted and ASSISTANT_MODEL exists, via the Models
 * API — a metadata lookup, so it costs no tokens. Subclasses are checked
 * before OpenAI.APIError, which every one of them extends.
 */
export async function checkModelConnection(): Promise<ConnectionCheck> {
  const model = env.ASSISTANT_MODEL;
  try {
    const info = await getModelClient().models.retrieve(model);
    return { ok: true, model, displayName: info.id };
  } catch (err) {
    if (err instanceof OpenAI.AuthenticationError) {
      return { ok: false, model, reason: "The API key was rejected" };
    }
    if (err instanceof OpenAI.PermissionDeniedError) {
      return { ok: false, model, reason: "The API key doesn't have access to this model" };
    }
    if (err instanceof OpenAI.NotFoundError) {
      return { ok: false, model, reason: `Model "${model}" was not found — check ASSISTANT_MODEL` };
    }
    if (err instanceof OpenAI.APIConnectionError) {
      return { ok: false, model, reason: `Couldn't reach ${env.ASSISTANT_BASE_URL} from this server` };
    }
    if (err instanceof OpenAI.APIError) {
      return { ok: false, model, reason: `Model API error (${err.status ?? "no status"})` };
    }
    throw err;
  }
}
