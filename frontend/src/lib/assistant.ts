import { ApiError, apiFetch } from "./apiClient";
import { getAuthHeaders } from "./auth";
import { API_BASE_URL } from "./env";

/** Admin AI assistant — client for /api/assistant (admin-only on the server). */

export type AssistantActionStatus = "proposed" | "executed" | "rejected" | "failed" | "expired";
export type AssistantToolName = "propose_expense" | "propose_revenue";

export interface AssistantAction {
  id: string;
  toolUseId: string | null;
  toolName: AssistantToolName;
  brandId: string;
  /** The validated service input Confirm will write — createExpense/createRevenue's shape. */
  payload: Record<string, unknown>;
  /** Fields the assistant defaulted (e.g. date, payment method) rather than heard from the admin. */
  assumedFields: string[];
  status: AssistantActionStatus;
  resultTable: string | null;
  resultId: string | null;
  error: string | null;
  expiresAt: string;
  createdAt: string;
}

/** One thing the admin or the assistant said. toolCallIds link it to the draft cards its tool calls proposed. */
export interface AssistantStoredMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  toolCallIds: string[];
  createdAt: string;
}

export interface AssistantConversationSummary {
  id: string;
  brandId: string | null;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssistantConversation extends AssistantConversationSummary {
  messages: AssistantStoredMessage[];
  actions: AssistantAction[];
}

export interface AssistantTurnResult {
  conversationId: string;
  reply: string;
  stopReason: string | null;
  actions: AssistantAction[];
}

export type AssistantStreamEvent =
  | { type: "start"; conversationId: string }
  | { type: "text"; delta: string }
  | { type: "tool"; name: string }
  | { type: "action"; action: AssistantAction }
  | { type: "done"; result: AssistantTurnResult }
  | { type: "error"; message: string; status: number };

export function getAssistantStatus(): Promise<{ enabled: boolean; model: string }> {
  return apiFetch("/api/assistant/status");
}

export function listAssistantConversations(): Promise<AssistantConversationSummary[]> {
  return apiFetch("/api/assistant/conversations");
}

export function getAssistantConversation(id: string): Promise<AssistantConversation> {
  return apiFetch(`/api/assistant/conversations/${encodeURIComponent(id)}`);
}

export function deleteAssistantConversation(id: string): Promise<{ deleted: boolean }> {
  return apiFetch(`/api/assistant/conversations/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function confirmAssistantAction(
  id: string,
  overrides: Record<string, unknown>,
): Promise<{ action: AssistantAction; record: unknown }> {
  return apiFetch(`/api/assistant/actions/${encodeURIComponent(id)}/confirm`, {
    method: "POST",
    body: JSON.stringify({ overrides }),
  });
}

export function rejectAssistantAction(id: string): Promise<AssistantAction> {
  return apiFetch(`/api/assistant/actions/${encodeURIComponent(id)}/reject`, { method: "POST" });
}

/**
 * One chat turn over server-sent events. POST + fetch rather than
 * EventSource, which can only GET and can't send the Authorization header.
 * Resolves when the stream ends; every event — including a mid-stream
 * `error` — goes to onEvent. Failures before the stream opens (404, 409,
 * 429…) throw ApiError like any other call.
 */
export async function streamAssistantTurn(
  body: { conversationId?: string; brandId: string | null; message: string },
  onEvent: (event: AssistantStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/assistant/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream", ...getAuthHeaders() },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !(res.headers.get("content-type") ?? "").includes("text/event-stream") || !res.body) {
    const envelope = (await res.json().catch(() => null)) as { error?: { message?: string; details?: unknown } } | null;
    throw new ApiError(envelope?.error?.message ?? `Request failed with status ${res.status}`, res.status, envelope?.error?.details);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // Events are separated by a blank line; a chunk can end mid-event, so
    // keep the remainder for the next read.
    let boundary: number;
    while ((boundary = buffer.indexOf("\n\n")) >= 0) {
      const chunk = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      for (const line of chunk.split("\n")) {
        if (line.startsWith("data: ")) onEvent(JSON.parse(line.slice(6)) as AssistantStreamEvent);
      }
    }
  }
}
