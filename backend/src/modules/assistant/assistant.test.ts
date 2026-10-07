import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { businessDate } from "../../utils/businessDate.js";
import { toChatMessage, toDisplayMessage, turnReplyText } from "./history.js";
import { buildTurnContext, replyLanguageFor } from "./prompt.js";
import { resolveBrand, ToolInputError, type ToolContext } from "./tools/context.js";
import { defineTool, executeTool, toFunctionTool } from "./tools/defineTool.js";

const alh = { id: "b1", name: "Alia Hijab", code: "ALH" };
const nri = { id: "b2", name: "Noori", code: "NRI" };
const ctx = (activeBrand: ToolContext["activeBrand"]): ToolContext => ({
  userId: "u1",
  conversationId: "c1",
  brands: [alh, nri],
  activeBrand,
  proposedActionIds: [],
});

test("resolveBrand defaults to the active workspace and matches codes case-insensitively", () => {
  assert.equal(resolveBrand(ctx(alh), undefined), alh);
  assert.equal(resolveBrand(ctx(alh), "nri"), nri);
});

test("resolveBrand tells the model which codes are valid", () => {
  assert.throws(() => resolveBrand(ctx(alh), "XYZ"), (err: unknown) => err instanceof ToolInputError && /ALH, NRI/.test(err.message));
  assert.throws(() => resolveBrand(ctx(null), undefined), (err: unknown) => err instanceof ToolInputError && /No active workspace/.test(err.message));
});

test("turnReplyText joins the assistant's text across a turn's tool round-trips", () => {
  assert.equal(
    turnReplyText([
      {
        role: "assistant",
        content: "Let me check October.",
        tool_calls: [{ id: "c1", type: "function", function: { name: "get_finance_summary", arguments: "{}" } }],
      },
      { role: "tool", tool_call_id: "c1", content: "{}" },
      { role: "assistant", content: "You spent 3,000 EGP." },
      { role: "assistant", content: "  " },
    ]),
    "Let me check October.\n\nYou spent 3,000 EGP.",
  );
  assert.equal(turnReplyText([{ role: "user", content: "hi" }]), "");
});

test("stored rows replay as chat messages; legacy Anthropic rows degrade to their text", () => {
  const current = { role: "assistant", content: "Hi", tool_calls: [{ id: "c1", type: "function", function: { name: "x", arguments: "{}" } }] };
  assert.equal(toChatMessage({ role: "assistant", content: current }), current);
  assert.deepEqual(toChatMessage({ role: "user", content: [{ type: "text", text: "I spent 2000" }] }), { role: "user", content: "I spent 2000" });
  // A legacy tool_result-only user row and a legacy tool_use-only assistant row carry no text to keep.
  assert.equal(toChatMessage({ role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "{}" }] }), null);
  assert.equal(toChatMessage({ role: "assistant", content: [{ type: "tool_use", id: "t1", name: "x", input: {} }] }), null);
});

test("toDisplayMessage hides tool results and exposes the ids of the calls a message made", () => {
  assert.equal(toDisplayMessage({ role: "tool", content: { role: "tool", tool_call_id: "c1", content: "{}" } }), null);
  assert.deepEqual(
    toDisplayMessage({
      role: "assistant",
      content: { role: "assistant", content: "Drafted.", tool_calls: [{ id: "c9", type: "function", function: { name: "propose_expense", arguments: "{}" } }] },
    }),
    { role: "assistant", text: "Drafted.", toolCallIds: ["c9"] },
  );
});

const echo = defineTool({
  name: "echo",
  description: "test",
  inputSchema: z.object({ amount: z.coerce.number().positive(), note: z.string().optional(), method: z.string().default("cash") }),
  run: async (input) => JSON.stringify(input),
});

test("executeTool treats null as omitted and accepts numbers sent as strings", async () => {
  const outcome = await executeTool(echo, '{"amount":"2000","note":null}', { id: "c1" });
  assert.equal(outcome.isError, false);
  assert.deepEqual(JSON.parse(outcome.content), { amount: 2000, method: "cash" });
});

test("executeTool turns bad JSON, invalid input and thrown errors into readable error results", async () => {
  assert.match((await executeTool(echo, "{not json", { id: "c1" })).content, /not valid JSON/);
  assert.match((await executeTool(echo, '{"amount":-5}', { id: "c1" })).content, /^Error: invalid arguments — amount:/);
  const failing = defineTool({ name: "fail", description: "t", inputSchema: z.object({}), run: async () => { throw new ToolInputError("ask the admin"); } });
  assert.deepEqual(await executeTool(failing, "", { id: "c1" }), { content: "Error: ask the admin", isError: true });
});

test("toFunctionTool sends defaulted fields as optional and drops $schema", () => {
  const tool = toFunctionTool(echo);
  const parameters = tool.function.parameters as { required?: string[]; $schema?: string; properties: Record<string, unknown> };
  assert.equal(parameters.$schema, undefined);
  assert.deepEqual(parameters.required, ["amount"]);
  assert.ok(parameters.properties.method);
});

test("businessDate uses Cairo time, not UTC", () => {
  // 23:30 UTC on Oct 6 is already Oct 7 in Cairo (UTC+2/+3).
  assert.equal(businessDate(new Date("2026-10-06T23:30:00Z")), "2026-10-07");
});

test("buildTurnContext states the date, active workspace and draft statuses", () => {
  const text = buildTurnContext({
    brands: [alh, nri],
    activeBrand: alh,
    actions: [{ id: "a1", toolName: "propose_expense", status: "executed" }],
    replyLanguage: "English",
    now: new Date("2026-10-07T10:00:00Z"),
  });
  assert.match(text, /latest message is in English\. Write your whole reply in English/);
  assert.match(text, /Wednesday, 2026-10-07 \(Africa\/Cairo\)/);
  assert.match(text, /Active workspace: Alia Hijab \(code ALH\)/);
  assert.match(text, /ALH = Alia Hijab; NRI = Noori/);
  assert.match(text, /a1 \(propose_expense\): executed/);
});

test("replyLanguageFor picks Arabic for any Arabic script, English otherwise", () => {
  assert.equal(replyLanguageFor("صرفت ٢٠٠٠ جنيه للمحامي"), "Arabic");
  assert.equal(replyLanguageFor("دفعت 5000 لـ Cairo Fabrics"), "Arabic");
  assert.equal(replyLanguageFor("Record 60 EGP courier shipping for order #1043"), "English");
});
