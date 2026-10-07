"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { ArrowUp, History, Loader2, Plus, Sparkles, Square, Trash2 } from "lucide-react";
import { useLocale } from "@/context/LocaleContext";
import { ApiError } from "@/lib/apiClient";
import { deleteAssistantConversation, getAssistantStatus, listAssistantConversations } from "@/lib/assistant";
import { formatRelativeTime } from "@/lib/formatRelativeTime";
import type { Brand } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { ActionCard } from "./ActionCard";
import { MessageText } from "./MessageText";
import { CONVERSATIONS_KEY, type AssistantChat } from "./useAssistantChat";

/** What the admin sees while a tool runs — English source strings for t(). */
const TOOL_ACTIVITY: Record<string, string> = {
  get_finance_summary: "Checking the books…",
  list_expenses: "Looking up expenses…",
  list_revenues: "Looking up revenue…",
  get_cash_flow: "Checking balances…",
  find_ledger_entities: "Searching suppliers…",
  get_inventory_overview: "Checking stock…",
  propose_expense: "Drafting the expense…",
  propose_revenue: "Drafting the revenue…",
};

const SUGGESTIONS = [
  "How much did we spend this month?",
  "I spent 2000 EGP for the lawyer",
  "Record a sale for client Ahmed worth 5000 EGP",
  "What's running low on stock?",
];

export function AssistantPanel({
  chat,
  activeBrand,
  brands,
  open,
}: {
  chat: AssistantChat;
  activeBrand: Brand | null;
  brands: Brand[];
  open: boolean;
}) {
  const { t } = useLocale();
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const status = useSWR("assistant-status", getAssistantStatus, { revalidateOnFocus: false });
  const conversations = useSWR(open ? CONVERSATIONS_KEY : null, listAssistantConversations);
  const disabled = status.data ? !status.data.enabled : false;

  // Focus the input whenever the panel opens (Ctrl/Cmd+K is "open and start typing").
  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  // Keep the newest message in view as the reply streams in.
  const lastTurn = chat.turns.at(-1);
  const scrollKey = `${chat.turns.length}:${lastTurn?.role === "assistant" ? `${lastTurn.text.length}:${lastTurn.actions.length}` : ""}`;
  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [scrollKey]);

  // Grow the textarea with its content, up to a few lines.
  useEffect(() => {
    const element = inputRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 160)}px`;
  }, [draft]);

  function submit(text = draft) {
    if (!text.trim() || chat.busy || disabled) return;
    setDraft("");
    void chat.send(text, activeBrand?.id ?? null);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // isComposing: Enter that confirms an IME composition (Arabic and other
    // input methods) must not send a half-typed message.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  async function removeConversation(id: string) {
    try {
      await deleteAssistantConversation(id);
      if (chat.conversationId === id) chat.startNewChat();
      void conversations.mutate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("Something went wrong — please try again"));
    }
  }

  async function openConversation(id: string) {
    try {
      await chat.openConversation(id);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("Something went wrong — please try again"));
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-slate-200 py-3 ps-4 pe-12 dark:border-slate-800">
        <Sparkles className="size-4 shrink-0 text-violet-500" aria-hidden />
        <div className="min-w-0 flex-1">
          <SheetTitle className="text-sm font-semibold">{t("Assistant")}</SheetTitle>
          <SheetDescription className="truncate text-xs text-slate-500 dark:text-slate-400">
            {activeBrand ? `${t("Workspace")}: ${activeBrand.name}` : t("No workspace selected — name a brand in your message")}
          </SheetDescription>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" aria-label={t("History")} title={t("History")}>
              <History className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-80 w-72 overflow-y-auto">
            {conversations.data?.length ? (
              conversations.data.map((conversation) => (
                <DropdownMenuItem
                  key={conversation.id}
                  onSelect={() => void openConversation(conversation.id)}
                  className={cn("group flex items-center gap-2", conversation.id === chat.conversationId && "bg-slate-100 dark:bg-slate-800")}
                >
                  <div className="min-w-0 flex-1">
                    <p dir="auto" className="truncate text-sm">{conversation.title || t("Untitled chat")}</p>
                    <p className="text-[11px] text-slate-500" title={new Date(conversation.updatedAt).toLocaleString()}>
                      {formatRelativeTime(conversation.updatedAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={t("Delete chat")}
                    title={t("Delete chat")}
                    className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-red-600 dark:hover:bg-slate-700"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      void removeConversation(conversation.id);
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </DropdownMenuItem>
              ))
            ) : (
              <p className="px-2 py-3 text-center text-xs text-slate-500">{t("No previous chats")}</p>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button type="button" variant="ghost" size="icon" aria-label={t("New chat")} title={t("New chat")} onClick={chat.startNewChat}>
          <Plus className="size-4" />
        </Button>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {chat.loadingConversation ? (
          <div className="flex justify-center py-10">
            <Loader2 className="size-5 animate-spin text-slate-400" />
          </div>
        ) : chat.turns.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <Sparkles className="size-8 text-violet-400" aria-hidden />
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{t("Ask about your numbers, or tell me what you spent")}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{t("Nothing is saved until you confirm it.")}</p>
            </div>
            {disabled ? (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                {t("The assistant isn't set up on the server yet (ANTHROPIC_API_KEY).")}
              </p>
            ) : (
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => submit(t(suggestion))}
                    className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    {t(suggestion)}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          chat.turns.map((turn) =>
            turn.role === "user" ? (
              <div key={turn.id} className="flex justify-end">
                <p
                  dir="auto"
                  className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-ee-sm bg-slate-900 px-3 py-2 text-sm text-white dark:bg-slate-100 dark:text-slate-900"
                >
                  {turn.text}
                </p>
              </div>
            ) : (
              <div key={turn.id} className="space-y-2 text-sm text-slate-800 dark:text-slate-200">
                {turn.text ? <MessageText text={turn.text} /> : null}
                {turn.pending ? (
                  <p className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    {t(turn.activeTool ? (TOOL_ACTIVITY[turn.activeTool] ?? "Working…") : turn.text ? "Writing…" : "Thinking…")}
                  </p>
                ) : null}
                {turn.actions.map((action) => (
                  <ActionCard key={action.id} action={action} brands={brands} onChange={chat.replaceAction} />
                ))}
                {turn.error ? <p className="text-xs text-red-600 dark:text-red-400">{t(turn.error)}</p> : null}
              </div>
            ),
          )
        )}
      </div>

      <form
        className="border-t border-slate-200 p-3 dark:border-slate-800"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="flex items-end gap-2 rounded-xl border border-slate-200 bg-white p-2 focus-within:border-slate-400 dark:border-slate-700 dark:bg-slate-900">
          <textarea
            ref={inputRef}
            dir="auto"
            rows={1}
            value={draft}
            disabled={disabled}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t("Ask or record something… e.g. I spent 2000 EGP for the lawyer")}
            className="max-h-40 min-h-[1.5rem] flex-1 resize-none bg-transparent px-1 text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100"
          />
          {chat.busy ? (
            <Button type="button" size="icon" variant="secondary" onClick={chat.stop} aria-label={t("Stop")} title={t("Stop")}>
              <Square className="size-3.5" />
            </Button>
          ) : (
            <Button type="submit" size="icon" disabled={!draft.trim() || disabled} aria-label={t("Send")} title={t("Send")}>
              <ArrowUp className="size-4" />
            </Button>
          )}
        </div>
        <p className="mt-1.5 text-center text-[11px] text-slate-400">
          {t("Enter to send · Shift+Enter for a new line · Ctrl/⌘+K to open or close")}
        </p>
      </form>
    </div>
  );
}
