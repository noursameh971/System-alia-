"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { ArrowUp, History, Loader2, Mic, Paperclip, Plus, Sparkles, Square, Trash2, Upload, X } from "lucide-react";
import { useLocale } from "@/context/LocaleContext";
import { ApiError } from "@/lib/apiClient";
import { deleteAssistantConversation, getAssistantStatus, listAssistantConversations } from "@/lib/assistant";
import { formatPrice } from "@/lib/formatPrice";
import { formatRelativeTime } from "@/lib/formatRelativeTime";
import { RECEIPT_FILE_TYPES } from "@/lib/receiptImage";
import type { SpeechLanguage } from "@/lib/speechRecognition";
import type { Brand } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { ActionCard } from "./ActionCard";
import { MessageText } from "./MessageText";
import { ReceiptThumb } from "./ReceiptThumb";
import { CONVERSATIONS_KEY, type AssistantChat } from "./useAssistantChat";
import { MAX_ATTACHMENTS, useReceiptAttachments, type PendingAttachment } from "./useReceiptAttachments";
import { useSpeechInput } from "./useSpeechInput";

/** What the admin sees while a tool runs — English source strings for t(). */
const TOOL_ACTIVITY: Record<string, string> = {
  search_knowledge: "Searching the knowledge base…",
  business_snapshot: "Reviewing the whole business…",
  finance: "Checking the books…",
  ledger: "Checking supplier balances…",
  inventory: "Checking stock…",
  orders: "Looking at orders…",
  factory: "Checking the factory…",
  propose_expense: "Drafting the expense…",
  propose_revenue: "Drafting the revenue…",
  propose_supplier_bill: "Drafting the supplier bill…",
};

/** The same tools as nouns, for the "Checked: …" line under an answer. */
const TOOL_SOURCE: Record<string, string> = {
  search_knowledge: "Knowledge base",
  business_snapshot: "Business overview",
  finance: "Finance",
  ledger: "Ledger",
  inventory: "Inventory",
  orders: "Orders",
  factory: "Factory",
  propose_expense: "Draft",
  propose_revenue: "Draft",
  propose_supplier_bill: "Draft",
};

const VOICE_LANGUAGE_KEY = "alia-noori:assistantVoiceLanguage";

/**
 * The browser recognizes one language per session and can't detect which
 * one is being spoken, so the voice language is an explicit choice: the
 * last one used, else the app's language. The EN / ع chip switches it.
 */
function initialVoiceLanguage(locale: string): SpeechLanguage {
  try {
    const saved = window.localStorage.getItem(VOICE_LANGUAGE_KEY);
    if (saved === "ar-EG" || saved === "en-US") return saved;
  } catch {
    // Storage blocked (private mode etc.) — fall through to the app language.
  }
  return locale === "ar" ? "ar-EG" : "en-US";
}

function saveVoiceLanguage(language: SpeechLanguage): void {
  try {
    window.localStorage.setItem(VOICE_LANGUAGE_KEY, language);
  } catch {
    // Not remembered next time; nothing else depends on it.
  }
}

/** Spoken words go after whatever was already typed, separated by a space. */
function appendTranscript(typed: string, spoken: string): string {
  if (!spoken) return typed;
  return typed.trim() ? `${typed.trimEnd()} ${spoken}` : spoken;
}

/** The line under an attachment chip: what was read, or how it's going. `translate` marks an English source string for t(). */
function attachmentStatus(item: PendingAttachment): { text: string; translate: boolean; tone: "muted" | "warn" | "error" } {
  if (item.status === "uploading") return { text: "Reading receipt…", translate: true, tone: "muted" };
  if (item.status === "failed") return { text: item.error ?? "Couldn't upload this file", translate: true, tone: "error" };
  const reading = item.attachment?.extraction;
  if (!reading) return { text: "Couldn't read it — the assistant will ask for the details", translate: true, tone: "warn" };
  if (reading.kind === "other") return { text: "Doesn't look like a receipt", translate: true, tone: "warn" };
  const summary = [reading.amount !== null ? formatPrice(reading.amount) : null, reading.counterparty].filter(Boolean).join(" · ");
  return summary ? { text: summary, translate: false, tone: "muted" } : { text: "Read — nothing to record found", translate: true, tone: "warn" };
}

const SUGGESTIONS = [
  "How are we doing this month compared to last?",
  "What do we owe suppliers, and is anything overdue?",
  "What's running low, and is it selling?",
  "I spent 2000 EGP for the lawyer",
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
  const { t, locale } = useLocale();
  const [draft, setDraft] = useState("");
  const [voiceLanguage, setVoiceLanguage] = useState<SpeechLanguage>(() => initialVoiceLanguage(locale));
  /** What was in the box when listening started — the live transcript is shown after it. */
  const typedBeforeSpeech = useRef("");
  const speech = useSpeechInput({
    onTranscript: (spoken) => setDraft(appendTranscript(typedBeforeSpeech.current, spoken)),
    onError: (message) => toast.error(t(message)),
  });
  const onAttachmentRejected = useCallback((message: string) => toast.error(t(message)), [t]);
  const attachments = useReceiptAttachments({ onRejected: onAttachmentRejected });
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const status = useSWR("assistant-status", getAssistantStatus, { revalidateOnFocus: false });
  const conversations = useSWR(open ? CONVERSATIONS_KEY : null, listAssistantConversations);
  const disabled = status.data ? !status.data.enabled : false;

  // Focus the input whenever the panel opens (Ctrl/Cmd+K is "open and start
  // typing"), and turn the microphone off whenever it closes.
  const abortSpeech = speech.abort;
  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
    else abortSpeech();
  }, [open, abortSpeech]);

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

  const canSend = (draft.trim().length > 0 || attachments.ready.length > 0) && !attachments.uploading && !disabled;

  function submit(text = draft) {
    // A receipt still being read would otherwise go without what was read from it.
    if ((!text.trim() && attachments.ready.length === 0) || attachments.uploading || chat.busy || disabled) return;
    // What's in the box is what gets sent; nothing still being recognized may land in it afterwards.
    speech.abort();
    setDraft("");
    void chat.send(text, activeBrand?.id ?? null, { attachments: attachments.ready, locale: locale === "ar" ? "ar" : "en" });
    attachments.clear();
  }

  function hasFiles(event: DragEvent) {
    return Array.from(event.dataTransfer.types).includes("Files");
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // isComposing: Enter that confirms an IME composition (Arabic and other
    // input methods) must not send a half-typed message.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  function toggleListening() {
    if (speech.listening) {
      speech.stop();
      inputRef.current?.focus();
      return;
    }
    typedBeforeSpeech.current = draft;
    speech.start(voiceLanguage);
  }

  function switchVoiceLanguage() {
    const next: SpeechLanguage = voiceLanguage === "ar-EG" ? "en-US" : "ar-EG";
    setVoiceLanguage(next);
    saveVoiceLanguage(next);
    // Mid-sentence switch: keep what's been heard so far and carry on in the new language.
    if (speech.listening) {
      typedBeforeSpeech.current = draft;
      speech.start(next);
    }
  }

  const voiceLanguageName = voiceLanguage === "ar-EG" ? t("Arabic") : t("English");
  const micTitle = !speech.supported
    ? t("Voice input isn't available in this browser — try Chrome, Edge or Safari.")
    : speech.listening
      ? t("Stop listening")
      : `${t("Speak your message")} (${voiceLanguageName})`;

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
    <div
      className="relative flex h-full min-h-0 flex-col"
      onDragEnter={(event) => {
        if (!hasFiles(event) || disabled) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragOver={(event) => {
        if (!hasFiles(event) || disabled) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(event) => {
        if (!hasFiles(event) || disabled) return;
        event.preventDefault();
        setDragging(false);
        attachments.add(Array.from(event.dataTransfer.files));
        inputRef.current?.focus();
      }}
    >
      {dragging ? (
        <div className="pointer-events-none absolute inset-2 z-20 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-violet-400 bg-white/90 text-sm font-medium text-violet-700 dark:bg-slate-950/90 dark:text-violet-300">
          <Upload className="size-6" aria-hidden />
          {t("Drop a receipt or invoice to attach it")}
        </div>
      ) : null}
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
              <p className="text-xs text-slate-500 dark:text-slate-400">{t("You can also attach a receipt, invoice or transfer screenshot.")}</p>
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
              <div key={turn.id} className="flex flex-col items-end gap-1.5">
                {turn.attachments.length > 0 ? (
                  <div className="flex max-w-[85%] flex-wrap justify-end gap-1.5">
                    {turn.attachments.map((attachment) => (
                      <ReceiptThumb
                        key={attachment.id}
                        url={attachment.url}
                        contentType={attachment.contentType}
                        fileName={attachment.fileName}
                        className="h-28 w-24"
                      />
                    ))}
                  </div>
                ) : null}
                {turn.text ? (
                  <p
                    dir="auto"
                    className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-ee-sm bg-slate-900 px-3 py-2 text-sm text-white dark:bg-slate-100 dark:text-slate-900"
                  >
                    {turn.text}
                  </p>
                ) : null}
              </div>
            ) : (
              <div key={turn.id} className="space-y-2 text-sm text-slate-800 dark:text-slate-200">
                {turn.text ? <MessageText text={turn.text} /> : null}
                {turn.pending ? (
                  <p role="status" className="flex min-w-0 items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />
                    <span className="shrink-0">
                      {t(turn.activeTool ? (TOOL_ACTIVITY[turn.activeTool] ?? "Working…") : turn.text ? "Writing…" : "Thinking…")}
                    </span>
                    {turn.activeTool && turn.activeDetail ? (
                      <span dir="auto" className="truncate text-slate-400 dark:text-slate-500">
                        {turn.activeDetail}
                      </span>
                    ) : null}
                    {turn.steps.length > 1 ? <span className="shrink-0 text-slate-400">· {turn.steps.length}</span> : null}
                  </p>
                ) : turn.steps.length > 0 ? (
                  <details className="group text-[11px] text-slate-400 dark:text-slate-500">
                    <summary className="cursor-pointer list-none select-none hover:text-slate-600 dark:hover:text-slate-300">
                      {t("Checked")}: {[...new Set(turn.steps.map((step) => t(TOOL_SOURCE[step.name] ?? step.name)))].join(" · ")}
                    </summary>
                    <ol className="mt-1 list-decimal space-y-0.5 ps-5">
                      {turn.steps.map((step, index) => (
                        <li key={index} dir="auto">
                          {t(TOOL_SOURCE[step.name] ?? step.name)}
                          {step.detail ? <span className="text-slate-400"> — {step.detail}</span> : null}
                        </li>
                      ))}
                    </ol>
                  </details>
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
        <div className="rounded-xl border border-slate-200 bg-white p-2 focus-within:border-slate-400 dark:border-slate-700 dark:bg-slate-900">
          {attachments.items.length > 0 ? (
            <ul className="mb-2 flex flex-wrap gap-2" aria-label={t("Attached files")}>
              {attachments.items.map((item) => {
                const status = attachmentStatus(item);
                const statusText = status.translate ? t(status.text) : status.text;
                return (
                  <li
                    key={item.key}
                    className="flex max-w-full items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-1 pe-1.5 dark:border-slate-700 dark:bg-slate-800/60"
                  >
                    <ReceiptThumb
                      url={item.attachment?.url ?? null}
                      previewUrl={item.previewUrl}
                      contentType={item.contentType}
                      fileName={item.fileName}
                      className="size-10"
                    />
                    <div className="min-w-0 max-w-[11rem] text-xs">
                      <p dir="auto" className="truncate font-medium text-slate-700 dark:text-slate-200" title={item.fileName}>
                        {item.fileName}
                      </p>
                      <p
                        role={item.status === "uploading" ? "status" : undefined}
                        title={statusText}
                        className={cn(
                          "flex items-center gap-1",
                          status.tone === "error"
                            ? "text-red-600 dark:text-red-400"
                            : status.tone === "warn"
                              ? "text-amber-700 dark:text-amber-400"
                              : "text-slate-500 dark:text-slate-400",
                        )}
                      >
                        {item.status === "uploading" ? <Loader2 className="size-3 shrink-0 animate-spin" aria-hidden /> : null}
                        <span dir="auto" className="truncate">
                          {statusText}
                        </span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => attachments.remove(item.key)}
                      aria-label={`${t("Remove attachment")}: ${item.fileName}`}
                      title={t("Remove attachment")}
                      className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                    >
                      <X className="size-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              dir="auto"
              rows={1}
              value={draft}
              disabled={disabled}
              onChange={(event) => {
                // Typing takes over from the microphone.
                if (speech.listening) speech.abort();
                setDraft(event.target.value);
              }}
              onKeyDown={onKeyDown}
              onPaste={(event) => {
                // A pasted screenshot (e.g. straight from the InstaPay app) attaches like a picked file.
                const files = Array.from(event.clipboardData.files);
                if (files.length === 0) return;
                event.preventDefault();
                attachments.add(files);
              }}
              placeholder={
                attachments.items.length > 0 && !draft
                  ? t("Add a note (optional), then press Enter")
                  : t("Ask or record something… e.g. I spent 2000 EGP for the lawyer")
              }
              className="max-h-40 min-h-[1.5rem] flex-1 resize-none bg-transparent px-1 text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100"
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || attachments.items.length >= MAX_ATTACHMENTS}
              aria-label={t("Attach a receipt or invoice")}
              title={`${t("Attach a receipt or invoice")} (JPEG, PNG, WEBP, PDF)`}
            >
              <Paperclip className="size-4" />
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept={RECEIPT_FILE_TYPES.join(",")}
              multiple
              hidden
              onChange={(event) => {
                attachments.add(Array.from(event.target.files ?? []));
                event.target.value = ""; // so picking the same file again still fires
                inputRef.current?.focus();
              }}
            />
            <button
              type="button"
              onClick={switchVoiceLanguage}
              disabled={disabled || !speech.supported}
              aria-label={`${t("Voice language")}: ${voiceLanguageName}`}
              title={`${t("Voice language")}: ${voiceLanguageName} — ${t("click to switch")}`}
              className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-md px-1.5 text-[11px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:pointer-events-none disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            >
              {voiceLanguage === "ar-EG" ? "ع" : "EN"}
            </button>
            <Button
              type="button"
              size="icon"
              variant={speech.listening ? "default" : "ghost"}
              onClick={toggleListening}
              disabled={disabled || !speech.supported}
              aria-pressed={speech.listening}
              aria-label={micTitle}
              title={micTitle}
              className={cn(
                speech.listening &&
                  "animate-pulse bg-red-600 text-white hover:bg-red-700 dark:bg-red-500 dark:text-white dark:hover:bg-red-600",
              )}
            >
              <Mic className="size-4" />
            </Button>
            {chat.busy ? (
              <Button type="button" size="icon" variant="secondary" onClick={chat.stop} aria-label={t("Stop")} title={t("Stop")}>
                <Square className="size-3.5" />
              </Button>
            ) : (
              <Button
                type="submit"
                size="icon"
                disabled={!canSend}
                aria-label={t("Send")}
                title={attachments.uploading ? t("Wait for the receipt to finish reading") : t("Send")}
              >
                <ArrowUp className="size-4" />
              </Button>
            )}
          </div>
        </div>
        {speech.listening ? (
          <p role="status" className="mt-1.5 text-center text-[11px] font-medium text-red-600 dark:text-red-400">
            {voiceLanguage === "ar-EG"
              ? t("Listening in Arabic… tap the mic when you're done")
              : t("Listening in English… tap the mic when you're done")}
          </p>
        ) : (
          <p className="mt-1.5 text-center text-[11px] text-slate-400">
            {t("Enter to send · Shift+Enter for a new line · Ctrl/⌘+K to open or close")}
          </p>
        )}
      </form>
    </div>
  );
}
