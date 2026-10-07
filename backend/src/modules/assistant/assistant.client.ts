import Anthropic from "@anthropic-ai/sdk";
import { env } from "../../config/env.js";
import { ApiError } from "../../utils/apiError.js";

/**
 * The one place the backend talks to the Claude API. The key lives only in
 * the backend's env — the browser never sees it, and every call is made on
 * behalf of an already-authenticated admin (see assistant.routes.ts).
 */

let client: Anthropic | null = null;

export function isAssistantEnabled(): boolean {
  return Boolean(env.ANTHROPIC_API_KEY);
}

export function getAnthropicClient(): Anthropic {
  if (!env.ANTHROPIC_API_KEY) {
    throw ApiError.serviceUnavailable("The assistant isn't configured on this server (ANTHROPIC_API_KEY is not set)");
  }
  // Built lazily so a server without a key still boots, and only once so
  // every request shares the SDK's connection pool. Timeout is in ms for
  // the TypeScript SDK — two minutes covers a multi-tool chat turn; retries
  // (429/5xx/connection errors) are the SDK's default of 2.
  client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: 120_000 });
  return client;
}

export type ConnectionCheck = { ok: true; model: string; displayName: string } | { ok: false; model: string; reason: string };

/**
 * Confirms the key is accepted and ASSISTANT_MODEL exists, via the Models
 * API — a metadata lookup, so it costs no tokens. Subclasses are checked
 * before Anthropic.APIError, which every one of them extends.
 */
export async function checkAnthropicConnection(): Promise<ConnectionCheck> {
  const model = env.ASSISTANT_MODEL;
  try {
    const info = await getAnthropicClient().models.retrieve(model);
    return { ok: true, model, displayName: info.display_name };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return { ok: false, model, reason: "The Anthropic API key was rejected" };
    }
    if (err instanceof Anthropic.PermissionDeniedError) {
      return { ok: false, model, reason: "The Anthropic API key doesn't have access to this model" };
    }
    if (err instanceof Anthropic.NotFoundError) {
      return { ok: false, model, reason: `Model "${model}" was not found — check ASSISTANT_MODEL` };
    }
    if (err instanceof Anthropic.APIConnectionError) {
      return { ok: false, model, reason: "Couldn't reach the Anthropic API from this server" };
    }
    if (err instanceof Anthropic.APIError) {
      return { ok: false, model, reason: `Anthropic API error (${err.status ?? "no status"})` };
    }
    throw err;
  }
}
