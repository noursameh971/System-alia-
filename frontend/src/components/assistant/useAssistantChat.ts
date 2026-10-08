"use client";

import { useCallback, useRef, useState } from "react";
import { useSWRConfig } from "swr";
import { ApiError } from "@/lib/apiClient";
import {
  getAssistantConversation,
  streamAssistantTurn,
  type AssistantAction,
  type AssistantAttachment,
  type AssistantConversation,
  type AssistantToolStep,
} from "@/lib/assistant";

export type AssistantTurn =
  | { id: string; role: "user"; text: string; attachments: AssistantAttachment[] }
  | {
      id: string;
      role: "assistant";
      text: string;
      actions: AssistantAction[];
      /** Still streaming in. */
      pending: boolean;
      /** The tool the assistant is running right now, while pending. */
      activeTool: string | null;
      /** What that tool is looking at ("statement: Cairo"), once its arguments are known. */
      activeDetail: string | null;
      /** Every tool the answer used, in order — shown under it. */
      steps: AssistantToolStep[];
      error: string | null;
    };

export const CONVERSATIONS_KEY = "assistant-conversations";

let nextId = 0;
const localId = () => `local-${++nextId}`;

/**
 * Rebuilds the chat view from a stored transcript. One assistant turn spans
 * every assistant message up to the next thing the admin typed; each draft
 * card is placed in the turn whose tool call proposed it.
 */
export function conversationToTurns(conversation: AssistantConversation): AssistantTurn[] {
  const actionByToolUse = new Map(conversation.actions.map((action) => [action.toolUseId, action]));
  const placed = new Set<string>();
  const turns: AssistantTurn[] = [];
  let current: Extract<AssistantTurn, { role: "assistant" }> | null = null;

  for (const message of conversation.messages) {
    if (message.role === "user") {
      const attachments = message.attachments ?? [];
      if (message.text || attachments.length > 0) {
        turns.push({ id: message.id, role: "user", text: message.text, attachments });
        current = null;
      }
      continue;
    }
    if (!current) {
      current = { id: message.id, role: "assistant", text: "", actions: [], pending: false, activeTool: null, activeDetail: null, steps: [], error: null };
      turns.push(current);
    }
    if (message.text) current.text = current.text ? `${current.text}\n\n${message.text}` : message.text;
    current.steps.push(...(message.toolSteps ?? []));
    for (const callId of message.toolCallIds) {
      const action = actionByToolUse.get(callId);
      if (action) {
        current.actions.push(action);
        placed.add(action.id);
      }
    }
  }

  // Drafts that can't be matched to a tool call (none expected) still get shown, at the end.
  const orphans = conversation.actions.filter((action) => !placed.has(action.id));
  if (orphans.length > 0) {
    turns.push({ id: localId(), role: "assistant", text: "", actions: orphans, pending: false, activeTool: null, activeDetail: null, steps: [], error: null });
  }
  return turns;
}

export function useAssistantChat() {
  const { mutate } = useSWRConfig();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [turns, setTurns] = useState<AssistantTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const updateAssistantTurn = useCallback(
    (id: string, update: (turn: Extract<AssistantTurn, { role: "assistant" }>) => Partial<Extract<AssistantTurn, { role: "assistant" }>>) => {
      setTurns((previous) =>
        previous.map((turn) => (turn.id === id && turn.role === "assistant" ? { ...turn, ...update(turn) } : turn)),
      );
    },
    [],
  );

  const send = useCallback(
    async (message: string, brandId: string | null, options: { attachments?: AssistantAttachment[]; locale?: "en" | "ar" } = {}) => {
      const text = message.trim();
      const attachments = options.attachments ?? [];
      if ((!text && attachments.length === 0) || busy) return;

      const replyId = localId();
      setTurns((previous) => [
        ...previous,
        { id: localId(), role: "user", text, attachments },
        { id: replyId, role: "assistant", text: "", actions: [], pending: true, activeTool: null, activeDetail: null, steps: [], error: null },
      ]);
      setBusy(true);
      const abort = new AbortController();
      abortRef.current = abort;

      try {
        await streamAssistantTurn(
          {
            conversationId: conversationId ?? undefined,
            brandId,
            message: text,
            attachmentIds: attachments.map((attachment) => attachment.id),
            locale: options.locale,
          },
          (event) => {
            switch (event.type) {
              case "start":
                setConversationId(event.conversationId);
                break;
              case "text":
                updateAssistantTurn(replyId, (turn) => ({ text: turn.text + event.delta, activeTool: null, activeDetail: null }));
                break;
              case "tool":
                // Sent twice per call: as the model starts writing it (no
                // detail), then as it runs (detail, "" when there's none to show).
                updateAssistantTurn(replyId, (turn) =>
                  event.detail === undefined
                    ? { activeTool: event.name, activeDetail: null }
                    : {
                        activeTool: event.name,
                        activeDetail: event.detail || null,
                        steps: [...turn.steps, { name: event.name, ...(event.detail ? { detail: event.detail } : {}) }],
                      },
                );
                break;
              case "action":
                updateAssistantTurn(replyId, (turn) => ({ actions: [...turn.actions, event.action] }));
                break;
              case "done":
                // The final reply is authoritative (it carries the server's
                // wording for cut-off or capped turns).
                updateAssistantTurn(replyId, () => ({
                  text: event.result.reply,
                  actions: event.result.actions,
                  pending: false,
                  activeTool: null,
                  activeDetail: null,
                }));
                break;
              case "error":
                updateAssistantTurn(replyId, () => ({ pending: false, activeTool: null, error: event.message }));
                break;
            }
          },
          abort.signal,
        );
      } catch (err) {
        if (abort.signal.aborted) {
          updateAssistantTurn(replyId, () => ({ pending: false, activeTool: null, error: "Stopped." }));
        } else {
          updateAssistantTurn(replyId, () => ({
            pending: false,
            activeTool: null,
            error: err instanceof ApiError ? err.message : "Couldn't reach the assistant — check your connection.",
          }));
        }
      } finally {
        // A stream that ended without done/error (connection dropped) must not spin forever.
        updateAssistantTurn(replyId, (turn) =>
          turn.pending ? { pending: false, activeTool: null, error: turn.error ?? "The reply was interrupted." } : {},
        );
        setBusy(false);
        abortRef.current = null;
        void mutate(CONVERSATIONS_KEY);
      }
    },
    [busy, conversationId, mutate, updateAssistantTurn],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const startNewChat = useCallback(() => {
    abortRef.current?.abort();
    setConversationId(null);
    setTurns([]);
  }, []);

  const openConversation = useCallback(async (id: string) => {
    abortRef.current?.abort();
    setLoadingConversation(true);
    try {
      const conversation = await getAssistantConversation(id);
      setConversationId(conversation.id);
      setTurns(conversationToTurns(conversation));
    } finally {
      setLoadingConversation(false);
    }
  }, []);

  /** A card changed status (confirmed, cancelled, expired…) — keep every copy of it in sync. */
  const replaceAction = useCallback((action: AssistantAction) => {
    setTurns((previous) =>
      previous.map((turn) =>
        turn.role === "assistant" && turn.actions.some((candidate) => candidate.id === action.id)
          ? { ...turn, actions: turn.actions.map((candidate) => (candidate.id === action.id ? action : candidate)) }
          : turn,
      ),
    );
  }, []);

  return { conversationId, turns, busy, loadingConversation, send, stop, startNewChat, openConversation, replaceAction };
}

export type AssistantChat = ReturnType<typeof useAssistantChat>;
