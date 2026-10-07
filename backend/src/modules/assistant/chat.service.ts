import OpenAI from "openai";
import { and, asc, eq, inArray } from "drizzle-orm";
import { env } from "../../config/env.js";
import { db } from "../../db/client.js";
import { aiActions, aiConversations, aiMessages } from "../../db/schema/index.js";
import { ApiError } from "../../utils/apiError.js";
import { listBrands } from "../brands/brands.service.js";
import { discardActions, type ActionRow } from "./actions.service.js";
import { getModelClient } from "./assistant.client.js";
import { toChatMessage, turnReplyText, type ChatMessage } from "./history.js";
import { buildTurnContext, replyLanguageFor, SYSTEM_PROMPT } from "./prompt.js";
import type { BrandRef, ToolContext } from "./tools/context.js";
import { executeTool, toFunctionTool, type AssistantTool } from "./tools/defineTool.js";
import { buildProposeTools } from "./tools/proposeTools.js";
import { buildReadTools } from "./tools/readTools.js";

/** One chat turn may take several tool round-trips ("compare this month to last" = two summaries + an answer); the cap stops a confused loop from running up cost. */
const MAX_TOOL_ITERATIONS = 8;
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
  message: string;
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
  /** The model is calling a tool — the UI shows what it's checking while it waits. */
  | { type: "tool"; name: string }
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

async function loadOrCreateConversation(input: ChatTurnInput, brands: BrandRef[]) {
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
    .values({ userId: input.userId, brandId: input.brandId ?? null, title: input.message.slice(0, 80) })
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
): Promise<StepResult> {
  const stream = await client.chat.completions.create(
    {
      model: env.ASSISTANT_MODEL,
      messages,
      tools,
      tool_choice: "auto",
      stream: true,
      stream_options: { include_usage: true },
      max_completion_tokens: MAX_COMPLETION_TOKENS,
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
  const conversation = await loadOrCreateConversation(input, brands);

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

    const turnContext = buildTurnContext({
      brands,
      activeBrand: ctx.activeBrand,
      replyLanguage: replyLanguageFor(input.message),
      actions: priorActions.map((action) => ({
        id: action.id,
        toolName: action.toolName,
        status: action.status === "proposed" && action.expiresAt.getTime() <= Date.now() ? "expired" : action.status,
      })),
    });
    const systemMessage: ChatMessage = { role: "system", content: `${SYSTEM_PROMPT}\n\n# This turn\n${turnContext}` };
    const userMessage: ChatMessage = { role: "user", content: input.message };
    const priorMessages = history.flatMap((row) => toChatMessage(row) ?? []);

    const tools: AssistantTool[] = [...buildReadTools(ctx), ...buildProposeTools(ctx)];
    const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));
    const functionTools = tools.map(toFunctionTool);

    // Everything the model adds this turn: assistant messages and tool results, in order.
    const newMessages: ChatMessage[] = [];
    const stepUsage: (OpenAI.CompletionUsage | null)[] = [];
    let finishReason: string | null = null;
    let wroteText = false;

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      let step: StepResult | undefined;
      for (let attempt = 0; !step; attempt++) {
        try {
          step = await streamStep(
            client,
            [systemMessage, ...priorMessages, userMessage, ...newMessages],
            functionTools,
            emit,
            options.signal,
            wroteText,
          );
        } catch (err) {
          // The provider rejects a malformed tool call before any text is
          // streamed, so retrying here can't duplicate what the admin saw.
          if (!isToolUseFailed(err) || attempt >= TOOL_CALL_RETRIES) throw err;
        }
      }

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

      // Run in order: a draft may depend on a lookup made earlier in the same step.
      for (const call of step.toolCalls) {
        const tool = toolsByName.get(call.name);
        const outcome = tool
          ? await executeTool(tool, call.arguments, { id: call.id })
          : { content: `Error: there is no tool named "${call.name}".`, isError: true };
        newMessages.push({ role: "tool", tool_call_id: call.id, content: outcome.content });
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

      await tx.insert(aiMessages).values({ conversationId: conversation.id, role: "user", content: userMessage, createdAt: nextTimestamp() });
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
