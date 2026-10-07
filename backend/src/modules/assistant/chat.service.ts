import Anthropic from "@anthropic-ai/sdk";
import { and, asc, eq, inArray } from "drizzle-orm";
import { env } from "../../config/env.js";
import { db } from "../../db/client.js";
import { aiActions, aiConversations, aiMessages } from "../../db/schema/index.js";
import { ApiError } from "../../utils/apiError.js";
import { listBrands } from "../brands/brands.service.js";
import { discardActions, type ActionRow } from "./actions.service.js";
import { getAnthropicClient } from "./assistant.client.js";
import { mergeConsecutiveRoles, replyText } from "./history.js";
import { buildTurnContext, SYSTEM_PROMPT } from "./prompt.js";
import type { BrandRef, ToolContext } from "./tools/context.js";
import { buildProposeTools } from "./tools/proposeTools.js";
import { buildReadTools } from "./tools/readTools.js";

type MessageParam = Anthropic.Beta.Messages.BetaMessageParam;

/** One chat turn may take several tool round-trips ("compare this month to last" = two summaries + an answer); the cap stops a confused loop from running up cost. */
const MAX_TOOL_ITERATIONS = 8;
const MAX_OUTPUT_TOKENS = 16_000;

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
 * Conversations whose turn is still running. Two overlapping turns would
 * both append to the same history and interleave tool calls, so the second
 * is refused. In-memory, which is enough for one backend instance — running
 * several would need this moved to the database.
 */
const turnsInFlight = new Set<string>();

/** SDK errors → what the admin's browser should see. Subclasses before Anthropic.APIError, which they all extend. */
function toApiError(err: unknown): unknown {
  if (err instanceof Anthropic.RateLimitError) {
    return new ApiError(429, "The assistant is getting too many requests right now — try again in a minute");
  }
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    console.error("Assistant: Anthropic rejected the API key", err.message);
    return ApiError.serviceUnavailable("The assistant is misconfigured on the server (API key rejected)");
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return ApiError.serviceUnavailable("Couldn't reach the assistant service — try again");
  }
  if (err instanceof Anthropic.APIError) {
    console.error(`Assistant: Anthropic API error ${err.status ?? ""}`, err.message);
    // 529 (overloaded) and 5xx are transient; anything else is a request we built wrong.
    return err.status && err.status >= 500
      ? ApiError.serviceUnavailable("The assistant service is busy — try again shortly")
      : new ApiError(502, "The assistant couldn't process that request");
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

export async function runChatTurn(input: ChatTurnInput): Promise<ChatTurnResult> {
  const client = getAnthropicClient();
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
  };

  try {
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

    const userMessage: MessageParam = { role: "user", content: [{ type: "text", text: input.message }] };
    const messages = mergeConsecutiveRoles([...history, userMessage]);
    const initialLength = messages.length;

    const runner = client.beta.messages.toolRunner({
      model: env.ASSISTANT_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      thinking: { type: "adaptive" },
      // Chat wants snappy answers; these are short lookups and drafts, not
      // deep reasoning. Raise if the test set shows multi-step reports
      // coming out wrong.
      output_config: { effort: "medium" },
      max_iterations: MAX_TOOL_ITERATIONS,
      system: [
        // Tools render before system, so this breakpoint caches the tool
        // definitions plus the static prompt across every turn.
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
        {
          type: "text",
          text: buildTurnContext({
            brands,
            activeBrand: ctx.activeBrand,
            actions: priorActions.map((action) => ({
              id: action.id,
              toolName: action.toolName,
              status: action.status === "proposed" && action.expiresAt.getTime() <= Date.now() ? "expired" : action.status,
            })),
          }),
        },
      ],
      tools: [...buildReadTools(ctx), ...buildProposeTools(ctx)],
      messages,
    });

    const responses: Anthropic.Beta.Messages.BetaMessage[] = [];
    for await (const response of runner) {
      responses.push(response);
    }
    const last = responses.at(-1);

    const newMessages = runner.params.messages.slice(initialLength);
    const usageQueue = [...responses];

    await db.transaction(async (tx) => {
      // Inserted one by one, in order: created_at must preserve the
      // sequence the history is replayed in.
      await tx.insert(aiMessages).values({ conversationId: conversation.id, role: "user", content: userMessage.content });
      for (const message of newMessages) {
        // The runner only adds system-role messages when tools change
        // mid-run, which this module never does — ai_messages holds the
        // user/assistant transcript only.
        if (message.role === "system") continue;
        const usage = message.role === "assistant" ? usageQueue.shift()?.usage : undefined;
        await tx.insert(aiMessages).values({
          conversationId: conversation.id,
          role: message.role,
          content: message.content,
          inputTokens: usage ? usage.input_tokens + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) : null,
          outputTokens: usage?.output_tokens ?? null,
        });
      }
      await tx
        .update(aiConversations)
        .set({ updatedAt: new Date(), ...(input.brandId !== undefined ? { brandId: input.brandId } : {}) })
        .where(eq(aiConversations.id, conversation.id));
    });

    let reply = replyText(newMessages.at(-1));
    if (last?.stop_reason === "refusal") {
      reply = reply || "I can't help with that request.";
    } else if (newMessages.at(-1)?.role !== "assistant") {
      reply = "I stopped before finishing — that took more steps than I'm allowed in one reply. Ask again, or narrow the question.";
    } else if (last?.stop_reason === "max_tokens") {
      reply = `${reply}\n\n(My reply was cut off — ask me to continue.)`.trim();
    }

    const actions =
      ctx.proposedActionIds.length > 0
        ? await db.select().from(aiActions).where(inArray(aiActions.id, ctx.proposedActionIds)).orderBy(asc(aiActions.createdAt))
        : [];

    return {
      conversationId: conversation.id,
      reply,
      stopReason: last?.stop_reason ?? null,
      actions,
      usage: {
        inputTokens: responses.reduce(
          (sum, r) => sum + r.usage.input_tokens + (r.usage.cache_read_input_tokens ?? 0) + (r.usage.cache_creation_input_tokens ?? 0),
          0,
        ),
        outputTokens: responses.reduce((sum, r) => sum + r.usage.output_tokens, 0),
        cacheReadInputTokens: responses.reduce((sum, r) => sum + (r.usage.cache_read_input_tokens ?? 0), 0),
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
