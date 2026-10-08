import OpenAI from "openai";
import { and, asc, eq, inArray } from "drizzle-orm";
import { env } from "../../config/env.js";
import { db } from "../../db/client.js";
import { aiActions, aiConversations, aiMessages } from "../../db/schema/index.js";
import { ApiError } from "../../utils/apiError.js";
import { listBrands } from "../brands/brands.service.js";
import { discardActions, type ActionRow } from "./actions.service.js";
import { getModelClient } from "./assistant.client.js";
import { describeAttachment, linkAttachmentsToMessage, loadTurnAttachments, type AttachmentRow } from "./attachments.service.js";
import { compactHistory, describeCall, toChatMessage, turnReplyText, userMessageText, type ChatMessage } from "./history.js";
import { retrieveForMessage } from "./retrieval.js";
import { calibrationFor, estimateTokens, fitToBudget, learnCalibration, overBudgetBy } from "./tokenBudget.js";
import { buildTurnContext, replyLanguageFor, SYSTEM_PROMPT } from "./prompt.js";
import type { BrandRef, ToolContext } from "./tools/context.js";
import { executeTool, toFunctionTool, type AssistantTool } from "./tools/defineTool.js";
import { buildProposeTools } from "./tools/proposeTools.js";
import { buildReadTools } from "./tools/readTools.js";

/**
 * Model calls per turn. An investigation chains steps — find the supplier,
 * read their statement, check stock, draft, answer — and reads in one step
 * run in parallel, so 10 is room for real multi-hop work while still
 * stopping a confused loop before it runs up cost.
 */
const MAX_TOOL_ITERATIONS = 10;
/** A tool result longer than this is cut (with a note) — one huge listing would otherwise eat the per-minute token budget. */
const MAX_TOOL_RESULT_CHARS = 6_000;
/** Drafts run one at a time, after the step's reads: one may depend on another, and each writes a row. */
const SEQUENTIAL_TOOLS = new Set(["propose_expense", "propose_revenue", "propose_supplier_bill"]);
/**
 * Room for the reply plus a reasoning model's hidden reasoning. Kept tight
 * on purpose: Groq charges the full cap against the rate limit up front
 * ("Requested" = prompt + this), so a generous cap drains the per-minute
 * and per-day token budgets several times faster than the replies do. A
 * reply that does hit it ends with the "cut off — ask me to continue" note.
 */
const MAX_COMPLETION_TOKENS = 2_000;
/** Groq answers a malformed tool call from the model with 400 tool_use_failed; a fresh sample almost always gets it right. */
const TOOL_CALL_RETRIES = 2;

export interface ChatTurnInput {
  userId: string;
  conversationId?: string;
  /** The workspace the chat is open in. undefined = keep the conversation's; null = cross-brand page. */
  brandId?: string | null;
  /** May be empty when attachments are sent on their own. */
  message: string;
  /** Uploaded via POST /attachments; they must be this admin's, and not already sent in another conversation. */
  attachmentIds?: string[];
  /** The panel's language — used for the reply when the message has no words to tell from. */
  locale?: "en" | "ar";
}

export interface ChatTurnResult {
  conversationId: string;
  reply: string;
  stopReason: string | null;
  /** Drafts proposed during this turn, for the UI to render as confirmation cards. */
  actions: ActionRow[];
  usage: { inputTokens: number; outputTokens: number; cacheReadInputTokens: number };
}

/**
 * What the streaming endpoint sends, as server-sent events, in order:
 * start → (text | tool | action)* → done, or error at any point after start.
 * runChatTurn emits start/text/tool/action; the controller adds done/error.
 */
export type ChatStreamEvent =
  | { type: "start"; conversationId: string }
  /** A chunk of the reply. Joined in order, the chunks are the reply as it's written. */
  | { type: "text"; delta: string }
  /**
   * The model is calling a tool — the UI shows what it's checking. Sent as
   * the model starts writing the call (no detail), then again as it runs,
   * with `detail` set (the view / search phrase, or "" if it has none).
   */
  | { type: "tool"; name: string; detail?: string }
  /** A draft was stored — render its confirmation card now. */
  | { type: "action"; action: ActionRow }
  | { type: "done"; result: ChatTurnResult }
  | { type: "error"; message: string; status: number };

export interface ChatTurnOptions {
  onEvent?: (event: ChatStreamEvent) => void;
  /** Aborted when the admin closes the panel or the connection drops — stops the model request mid-turn. */
  signal?: AbortSignal;
}

/**
 * Conversations whose turn is still running. Two overlapping turns would
 * both append to the same history and interleave tool calls, so the second
 * is refused. In-memory, which is enough for one backend instance — running
 * several would need this moved to the database.
 */
const turnsInFlight = new Set<string>();

/**
 * The provider rejected a tool call the model produced — malformed, or
 * not matching the tool's schema (Groq checks both server-side and answers
 * 400). It's a sampling miss, not a bad request: a fresh sample usually
 * gets it right. Matched on the message as well as the code because the
 * schema-validation variant doesn't always carry `tool_use_failed`.
 */
function isToolUseFailed(err: unknown): boolean {
  if (!(err instanceof OpenAI.BadRequestError)) return false;
  const body = err.error as { code?: unknown; error?: { code?: unknown } } | undefined;
  return (
    err.code === "tool_use_failed" ||
    body?.code === "tool_use_failed" ||
    body?.error?.code === "tool_use_failed" ||
    /tool call validation failed|failed to call a function/i.test(err.message)
  );
}

/** The provider's own explanation from an error body, when it sent one. */
function providerReason(err: InstanceType<typeof OpenAI.APIError>): string | null {
  const body = err.error as { message?: unknown; error?: { message?: unknown } } | undefined;
  const reason = body?.error?.message ?? body?.message;
  return typeof reason === "string" && reason ? reason : null;
}

/** SDK errors → what the admin's browser should see. Subclasses before OpenAI.APIError, which they all extend. */
function toApiError(err: unknown): unknown {
  // The browser went away mid-turn — nobody is left to tell, and it isn't an API fault worth logging.
  if (err instanceof OpenAI.APIUserAbortError) {
    return new ApiError(499, "Cancelled");
  }
  if (err instanceof OpenAI.RateLimitError) {
    // Groq's message says which limit (per minute or per day) and how long
    // to wait — "15m30s" is very different advice from "a minute".
    const reason = providerReason(err);
    return new ApiError(429, reason ? `The assistant hit the model provider's usage limit: ${reason}` : "The assistant has hit its usage limit — try again shortly");
  }
  if (err instanceof OpenAI.APIError && (err.status === 413 || /context.length|too large|maximum context/i.test(err.message))) {
    // Groq answers 413 when a single request is bigger than the per-minute
    // token budget allows — a long chat plus large tool results — and the
    // loop's own shrink-and-retry couldn't get under it.
    console.error("Assistant: request too large even after shrinking:", providerReason(err) ?? err.message);
    return new ApiError(413, "This conversation has grown too long for the model's limits — start a new chat (the drafts and history here are kept).");
  }
  if (err instanceof OpenAI.AuthenticationError || err instanceof OpenAI.PermissionDeniedError) {
    console.error("Assistant: the model API rejected the key", err.message);
    return ApiError.serviceUnavailable("The assistant is misconfigured on the server (API key rejected)");
  }
  if (err instanceof OpenAI.APIConnectionError) {
    return ApiError.serviceUnavailable("Couldn't reach the assistant service — try again");
  }
  if (err instanceof OpenAI.APIError) {
    console.error(`Assistant: model API error ${err.status ?? ""}`, err.message);
    if (err.status && err.status >= 500) {
      return ApiError.serviceUnavailable("The assistant service is busy — try again shortly");
    }
    // Any other rejection: pass the provider's own explanation through. It's
    // written for the account holder (e.g. a billing or model-access
    // problem), and only admins can reach this route, so it's both safe and
    // the fastest way for them to see what to fix.
    const reason = providerReason(err);
    return new ApiError(502, reason ? `The assistant service refused the request: ${reason}` : "The assistant couldn't process that request");
  }
  return err;
}

/** A new conversation's title: what the admin typed, or what they attached. */
function conversationTitle(message: string, attachments: AttachmentRow[]): string | null {
  if (message.trim()) return message.trim().slice(0, 80);
  const first = attachments[0];
  if (!first) return null;
  const counterparty = (first.extraction as { counterparty?: unknown } | null)?.counterparty;
  return `Receipt: ${typeof counterparty === "string" ? counterparty : (first.fileName ?? "attachment")}`.slice(0, 80);
}

async function loadOrCreateConversation(input: ChatTurnInput, brands: BrandRef[], title: string | null) {
  if (input.brandId && !brands.some((brand) => brand.id === input.brandId)) {
    throw ApiError.badRequest("That workspace doesn't exist or is inactive");
  }

  if (input.conversationId) {
    const [conversation] = await db
      .select()
      .from(aiConversations)
      .where(and(eq(aiConversations.id, input.conversationId), eq(aiConversations.userId, input.userId)))
      .limit(1);
    if (!conversation) throw ApiError.notFound("Conversation not found");
    return conversation;
  }

  const [created] = await db
    .insert(aiConversations)
    .values({ userId: input.userId, brandId: input.brandId ?? null, title })
    .returning();
  return created!;
}

interface StepResult {
  content: string;
  toolCalls: { id: string; name: string; arguments: string }[];
  finishReason: string | null;
  usage: OpenAI.CompletionUsage | null;
}

/**
 * One model call, streamed: text deltas go straight to the admin, tool
 * calls are assembled from their fragments. `separateFromPrevious` puts a
 * paragraph break before this step's text when an earlier step already
 * wrote some, matching how turnReplyText joins them.
 */
async function streamStep(
  client: OpenAI,
  messages: ChatMessage[],
  tools: OpenAI.Chat.Completions.ChatCompletionFunctionTool[],
  emit: (event: ChatStreamEvent) => void,
  signal: AbortSignal | undefined,
  separateFromPrevious: boolean,
  maxCompletionTokens: number,
): Promise<StepResult> {
  const stream = await client.chat.completions.create(
    {
      model: env.ASSISTANT_MODEL,
      messages,
      tools,
      tool_choice: "auto",
      stream: true,
      stream_options: { include_usage: true },
      max_completion_tokens: maxCompletionTokens,
      ...(env.ASSISTANT_REASONING_EFFORT ? { reasoning_effort: env.ASSISTANT_REASONING_EFFORT } : {}),
    },
    { signal },
  );

  let content = "";
  let finishReason: string | null = null;
  let usage: OpenAI.CompletionUsage | null = null;
  const calls = new Map<number, { id: string; name: string; arguments: string }>();

  for await (const chunk of stream) {
    if (chunk.usage) usage = chunk.usage;
    const choice = chunk.choices[0];
    if (!choice) continue;
    // Reasoning models also stream a non-standard `reasoning` field — the
    // model's private scratch work. It's deliberately never forwarded.
    if (choice.delta.content) {
      if (!content && separateFromPrevious) emit({ type: "text", delta: "\n\n" });
      content += choice.delta.content;
      emit({ type: "text", delta: choice.delta.content });
    }
    for (const fragment of choice.delta.tool_calls ?? []) {
      let call = calls.get(fragment.index);
      if (!call) {
        call = { id: "", name: "", arguments: "" };
        calls.set(fragment.index, call);
      }
      if (fragment.id) call.id = fragment.id;
      if (fragment.function?.name && !call.name) {
        call.name = fragment.function.name;
        emit({ type: "tool", name: call.name });
      }
      if (fragment.function?.arguments) call.arguments += fragment.function.arguments;
    }
    if (choice.finish_reason) finishReason = choice.finish_reason;
  }
  // An aborted stream just stops yielding — the SDK swallows the abort —
  // so without this a cancelled reply would look finished and be saved.
  if (signal?.aborted) throw new OpenAI.APIUserAbortError();

  const toolCalls = [...calls.entries()]
    .sort(([a], [b]) => a - b)
    // A provider that omits call ids still needs one to pair each result with its call.
    .map(([index, call]) => ({ ...call, id: call.id || `call_${Date.now().toString(36)}_${index}` }));
  return { content, toolCalls, finishReason, usage };
}

export async function runChatTurn(input: ChatTurnInput, options: ChatTurnOptions = {}): Promise<ChatTurnResult> {
  const emit = options.onEvent ?? (() => {});
  const client = getModelClient();
  const brands = await listBrands();
  const attachmentIds = [...new Set(input.attachmentIds ?? [])];
  // Checked before a new conversation is created, so a bad attachment id
  // doesn't leave an empty chat behind. (A conversation id that isn't this
  // admin's matches no attachments, and then 404s just below.)
  const { sending, usable } = await loadTurnAttachments(input.userId, input.conversationId ?? null, attachmentIds);
  const conversation = await loadOrCreateConversation(input, brands, conversationTitle(input.message, sending));

  if (turnsInFlight.has(conversation.id)) {
    throw ApiError.conflict("The assistant is still answering your previous message in this conversation");
  }
  turnsInFlight.add(conversation.id);

  const ctx: ToolContext = {
    userId: input.userId,
    conversationId: conversation.id,
    brands,
    activeBrand: brands.find((brand) => brand.id === (input.brandId === undefined ? conversation.brandId : input.brandId)) ?? null,
    proposedActionIds: [],
    onActionProposed: (action) => emit({ type: "action", action }),
    attachments: usable,
    knowledgeRefs: 0,
  };

  try {
    // After the checks above, so a 404/409 is still a plain HTTP error
    // rather than an event on an already-open stream.
    emit({ type: "start", conversationId: conversation.id });

    const [history, priorActions] = await Promise.all([
      db
        .select({ role: aiMessages.role, content: aiMessages.content })
        .from(aiMessages)
        .where(eq(aiMessages.conversationId, conversation.id))
        .orderBy(asc(aiMessages.createdAt)),
      db
        .select({ id: aiActions.id, toolName: aiActions.toolName, status: aiActions.status, expiresAt: aiActions.expiresAt })
        .from(aiActions)
        .where(eq(aiActions.conversationId, conversation.id))
        .orderBy(asc(aiActions.createdAt)),
    ]);

    // Classic RAG, before the model runs: the knowledge base's best matches
    // for the admin's message ride along in the turn context, so a question
    // about a contract or a past entry can be answered without spending a
    // whole agent step on a search. Only confident matches are included.
    const knowledge = await retrieveForMessage(input.message, ctx);
    const turnContext = buildTurnContext({
      brands,
      activeBrand: ctx.activeBrand,
      knowledge,
      replyLanguage: replyLanguageFor(input.message, input.locale === "ar" ? "Arabic" : "English"),
      actions: priorActions.map((action) => ({
        id: action.id,
        toolName: action.toolName,
        status: action.status === "proposed" && action.expiresAt.getTime() <= Date.now() ? "expired" : action.status,
      })),
    });
    const systemMessage: ChatMessage = { role: "system", content: `${SYSTEM_PROMPT}\n\n# This turn\n${turnContext}` };
    // Each attachment reaches the model as what was read from it (see
    // attachments.service.ts), stored with the message so replays match.
    const attachmentBlocks = await Promise.all(sending.map((attachment) => describeAttachment(attachment, ctx.activeBrand)));
    const userMessage: ChatMessage = { role: "user", content: userMessageText(input.message, attachmentBlocks) };
    const priorMessages = compactHistory(history.flatMap((row) => toChatMessage(row) ?? []));

    const tools: AssistantTool[] = [...buildReadTools(ctx), ...buildProposeTools(ctx)];
    const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));
    const functionTools = tools.map(toFunctionTool);
    const toolsJson = JSON.stringify(functionTools);

    // Everything the model adds this turn: assistant messages and tool results, in order.
    const newMessages: ChatMessage[] = [];
    const stepUsage: (OpenAI.CompletionUsage | null)[] = [];
    let finishReason: string | null = null;
    let wroteText = false;

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      // Sized to the provider's per-minute budget (see tokenBudget.ts).
      const leading = [systemMessage, ...priorMessages, userMessage];
      const fit = (tokensPerMinute: number) =>
        fitToBudget([...leading, ...newMessages], toolsJson, {
          tokensPerMinute,
          maxCompletion: MAX_COMPLETION_TOKENS,
          turnStart: leading.length,
          calibration: calibrationFor(env.ASSISTANT_MODEL),
        });
      let budget = env.ASSISTANT_TOKENS_PER_MINUTE;
      let fitted = fit(budget);
      if (fitted.compacted > 0) {
        // Worth knowing in the logs: a turn squeezed this hard is near the provider's limits.
        console.warn(`Assistant: step ${iteration + 1} shortened ${fitted.compacted} earlier tool result(s) to fit ${budget} tokens/min (${env.ASSISTANT_MODEL})`);
      }
      let step: StepResult | undefined;
      let rejection: string | null = null;
      let shrinks = 0;
      for (let attempt = 0; !step; attempt++) {
        // After a rejected call, the retry carries the provider's reason, so
        // the model fixes the call rather than resampling the same mistake.
        // Only for this request — it isn't saved to the transcript.
        const messages: ChatMessage[] = rejection
          ? [...fitted.messages, { role: "system", content: `Your previous tool call was rejected before it ran: ${rejection} Call the tool again with valid arguments (every required field present, values of the right type).` }]
          : fitted.messages;
        try {
          step = await streamStep(client, messages, functionTools, emit, options.signal, wroteText, fitted.maxCompletionTokens);
        } catch (err) {
          // Too big for the per-minute budget: the provider says by how much,
          // so shed exactly that (plus a margin) and send again.
          const over = err instanceof OpenAI.APIError && err.status === 413 ? overBudgetBy(providerReason(err) ?? err.message) : null;
          if (over !== null && shrinks < 2) {
            shrinks++;
            budget -= over + 250;
            fitted = fit(budget);
            continue;
          }
          // The provider rejects a malformed tool call before any text is
          // streamed, so retrying here can't duplicate what the admin saw.
          if (!isToolUseFailed(err) || attempt >= TOOL_CALL_RETRIES) throw err;
          rejection = providerReason(err as InstanceType<typeof OpenAI.APIError>) ?? (err as Error).message;
        }
      }
      if (step.usage?.prompt_tokens) learnCalibration(env.ASSISTANT_MODEL, estimateTokens(fitted.messages, toolsJson), step.usage.prompt_tokens);

      if (step.content) wroteText = true;
      finishReason = step.finishReason;
      stepUsage.push(step.usage);
      newMessages.push({
        role: "assistant",
        content: step.content,
        ...(step.toolCalls.length > 0
          ? {
              tool_calls: step.toolCalls.map((call) => ({
                id: call.id,
                type: "function" as const,
                function: { name: call.name, arguments: call.arguments || "{}" },
              })),
            }
          : {}),
      });

      if (step.toolCalls.length === 0) break;

      // Reads run in parallel; drafts run after them, one at a time. Results
      // go back in call order, whichever finished first.
      const run = async (call: StepResult["toolCalls"][number]) => {
        const tool = toolsByName.get(call.name);
        if (!tool) return `Error: there is no tool named "${call.name}". Available: ${[...toolsByName.keys()].join(", ")}.`;
        // detail is always set here ("" when there's nothing to show): it's how the UI tells "running" from "being written".
        emit({ type: "tool", name: call.name, detail: describeCall(call.arguments) ?? "" });
        const outcome = await executeTool(tool, call.arguments, { id: call.id });
        return outcome.content.length > MAX_TOOL_RESULT_CHARS
          ? `${outcome.content.slice(0, MAX_TOOL_RESULT_CHARS)}… [result cut at ${MAX_TOOL_RESULT_CHARS} characters — narrow the query (dates, search words, view) for the rest]`
          : outcome.content;
      };
      const results = new Map<string, string>();
      const reads = step.toolCalls.filter((call) => !SEQUENTIAL_TOOLS.has(call.name));
      await Promise.all(reads.map(async (call) => results.set(call.id, await run(call))));
      for (const call of step.toolCalls.filter((candidate) => SEQUENTIAL_TOOLS.has(candidate.name))) {
        results.set(call.id, await run(call));
      }
      for (const call of step.toolCalls) {
        newMessages.push({ role: "tool", tool_call_id: call.id, content: results.get(call.id)! });
      }
    }

    await db.transaction(async (tx) => {
      // History is replayed in created_at order, so each row gets its own
      // explicit, strictly increasing timestamp. The column default can't
      // be relied on here: now() is the transaction's start time, so every
      // row in this transaction would tie and come back in arbitrary order.
      const turnStartedAt = Date.now();
      let sequence = 0;
      const nextTimestamp = () => new Date(turnStartedAt + sequence++);
      const usageQueue = [...stepUsage];

      const [savedUserMessage] = await tx
        .insert(aiMessages)
        .values({ conversationId: conversation.id, role: "user", content: userMessage, createdAt: nextTimestamp() })
        .returning({ id: aiMessages.id });
      await linkAttachmentsToMessage(tx, attachmentIds, conversation.id, savedUserMessage!.id);
      for (const message of newMessages) {
        if (message.role !== "assistant" && message.role !== "tool") continue;
        const usage = message.role === "assistant" ? usageQueue.shift() : undefined;
        await tx.insert(aiMessages).values({
          conversationId: conversation.id,
          role: message.role,
          content: message,
          inputTokens: usage?.prompt_tokens ?? null,
          outputTokens: usage?.completion_tokens ?? null,
          createdAt: nextTimestamp(),
        });
      }
      await tx
        .update(aiConversations)
        .set({ updatedAt: new Date(), ...(input.brandId !== undefined ? { brandId: input.brandId } : {}) })
        .where(eq(aiConversations.id, conversation.id));
    });

    let reply = turnReplyText(newMessages);
    if (finishReason === "content_filter") {
      reply = reply || "I can't help with that request.";
    } else if (newMessages.at(-1)?.role !== "assistant") {
      reply = "I stopped before finishing — that took more steps than I'm allowed in one reply. Ask again, or narrow the question.";
    } else if (finishReason === "length") {
      reply = `${reply}\n\n(My reply was cut off — ask me to continue.)`.trim();
    }

    const actions =
      ctx.proposedActionIds.length > 0
        ? await db.select().from(aiActions).where(inArray(aiActions.id, ctx.proposedActionIds)).orderBy(asc(aiActions.createdAt))
        : [];

    return {
      conversationId: conversation.id,
      reply,
      stopReason: finishReason,
      actions,
      usage: {
        inputTokens: stepUsage.reduce((sum, usage) => sum + (usage?.prompt_tokens ?? 0), 0),
        outputTokens: stepUsage.reduce((sum, usage) => sum + (usage?.completion_tokens ?? 0), 0),
        cacheReadInputTokens: stepUsage.reduce((sum, usage) => sum + (usage?.prompt_tokens_details?.cached_tokens ?? 0), 0),
      },
    };
  } catch (err) {
    // The transcript for this turn was never saved, so the admin never saw
    // a card for any draft it made — remove them rather than leave
    // confirmable actions with no conversation context.
    await discardActions(ctx.proposedActionIds);
    throw toApiError(err);
  } finally {
    turnsInFlight.delete(conversation.id);
  }
}
