import type OpenAI from "openai";
import { z } from "zod";

/**
 * A tool the model can call: a Zod input schema (sent to the model as JSON
 * Schema, and used to validate what comes back) plus the function that runs
 * it. Provider-neutral — chat.service.ts turns these into OpenAI-style
 * function tools.
 */
export interface ToolCall {
  /** The provider's id for this call — ai_actions.tool_use_id stores it so a card can be placed next to the message that proposed it. */
  id: string;
}

export interface AssistantTool<Input = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  // Method syntax on purpose: it lets a list of tools with different input
  // types share AssistantTool[]. executeTool only ever calls run with the
  // value inputSchema just parsed, so the input types always match.
  run(input: Input, call: ToolCall): Promise<string>;
}

export function defineTool<Schema extends z.ZodType>(tool: {
  name: string;
  description: string;
  inputSchema: Schema;
  run: (input: z.output<Schema>, call: ToolCall) => Promise<string>;
}): AssistantTool<z.output<Schema>> {
  return tool;
}

/**
 * Optional fields are declared as "this type or null". Open models often
 * send null for a field they mean to leave out, and some providers (Groq)
 * validate tool arguments against this schema server-side — a plain
 * `"type": "string"` there rejects the whole call before it reaches us.
 * executeTool drops the nulls again before Zod sees them.
 */
function allowNullForOptional(schema: Record<string, unknown>): Record<string, unknown> {
  const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
  if (!properties) return schema;
  const required = new Set((schema.required as string[] | undefined) ?? []);
  return {
    ...schema,
    properties: Object.fromEntries(
      Object.entries(properties).map(([key, property]) => [key, required.has(key) ? property : { anyOf: [property, { type: "null" }] }]),
    ),
  };
}

export function toFunctionTool(tool: AssistantTool): OpenAI.Chat.Completions.ChatCompletionFunctionTool {
  // io: "input" so fields with a .default() are shown as optional — the
  // model may leave them out. $schema is dropped: some providers reject
  // unknown top-level keywords.
  const { $schema: _ignored, ...schema } = z.toJSONSchema(tool.inputSchema, { io: "input" }) as Record<string, unknown>;
  return { type: "function", function: { name: tool.name, description: tool.description, parameters: allowNullForOptional(schema) } };
}

/** null means "not given" to every tool here; open models often send it for optional fields Zod would otherwise reject. */
function dropNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(dropNulls);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== null).map(([k, v]) => [k, dropNulls(v)]));
  }
  return value;
}

export interface ToolOutcome {
  content: string;
  isError: boolean;
}

/**
 * Parses, validates and runs one call. Every failure — malformed JSON,
 * schema mismatch, a thrown error — comes back as an error result the
 * model can read and correct, never as an exception that ends the turn.
 */
export async function executeTool(tool: AssistantTool, rawArguments: string, call: ToolCall): Promise<ToolOutcome> {
  let args: unknown;
  try {
    args = rawArguments.trim() ? JSON.parse(rawArguments) : {};
  } catch {
    return { content: "Error: the tool arguments were not valid JSON. Call the tool again with a JSON object.", isError: true };
  }

  const parsed = tool.inputSchema.safeParse(dropNulls(args));
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join(".") || "(input)"}: ${issue.message}`).join("; ");
    return { content: `Error: invalid arguments — ${issues}`, isError: true };
  }

  try {
    return { content: await tool.run(parsed.data, call), isError: false };
  } catch (err) {
    return { content: `Error: ${err instanceof Error ? err.message : String(err)}`, isError: true };
  }
}
