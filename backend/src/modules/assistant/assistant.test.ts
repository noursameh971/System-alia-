import test from "node:test";
import assert from "node:assert/strict";
import { businessDate } from "../../utils/businessDate.js";
import { mergeConsecutiveRoles, turnReplyText } from "./history.js";
import { buildTurnContext } from "./prompt.js";
import { resolveBrand, ToolInputError, type ToolContext } from "./tools/context.js";

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

test("mergeConsecutiveRoles joins a trailing tool_result turn with the next user message", () => {
  const merged = mergeConsecutiveRoles([
    { role: "user", content: "first" },
    { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "get_cash_flow", input: {} }] },
    { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "{}" }] },
    { role: "user", content: [{ type: "text", text: "next" }] },
  ]);
  assert.deepEqual(
    merged.map((message) => message.role),
    ["user", "assistant", "user"],
  );
  assert.deepEqual(
    (merged[2]!.content as { type: string }[]).map((block) => block.type),
    ["tool_result", "text"],
  );
});

test("turnReplyText joins the assistant's text across a turn's tool round-trips", () => {
  assert.equal(
    turnReplyText([
      {
        role: "assistant",
        content: [
          { type: "text", text: "Let me check October." },
          { type: "tool_use", id: "t1", name: "get_finance_summary", input: {} },
        ],
      },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "{}" }] },
      { role: "assistant", content: [{ type: "text", text: "You spent 3,000 EGP." }, { type: "text", text: "  " }] },
    ]),
    "Let me check October.\n\nYou spent 3,000 EGP.",
  );
  assert.equal(turnReplyText([{ role: "user", content: "hi" }]), "");
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
    now: new Date("2026-10-07T10:00:00Z"),
  });
  assert.match(text, /Wednesday, 2026-10-07 \(Africa\/Cairo\)/);
  assert.match(text, /Active workspace: Alia Hijab \(code ALH\)/);
  assert.match(text, /ALH = Alia Hijab; NRI = Noori/);
  assert.match(text, /a1 \(propose_expense\): executed/);
});
