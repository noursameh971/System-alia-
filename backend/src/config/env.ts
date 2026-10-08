import "dotenv/config";
import { z } from "zod";

const optionalSecret = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  JWT_EXPIRES_IN: z.string().default("8h"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  // The deployed Next.js frontend's origin (e.g. https://app.vercel.app),
  // separate from CORS_ORIGIN so local dev's default keeps working
  // unmodified — production just adds this on top. No trailing slash
  // (an Origin header never has one; see app.ts's normalizeOrigin).
  FRONTEND_URL: z.string().url().optional(),
  // Admin AI assistant (/api/assistant), talking to any OpenAI-compatible
  // chat-completions API — Groq by default. The key is optional: without
  // one the rest of the API runs normally and the assistant reports itself
  // disabled rather than failing the whole server at boot. An empty value
  // (a blank line left in a host's env UI) counts as unset.
  GROQ_API_KEY: optionalSecret,
  /** Overrides GROQ_API_KEY — for pointing ASSISTANT_BASE_URL at a different provider. */
  ASSISTANT_API_KEY: optionalSecret,
  ASSISTANT_BASE_URL: z.string().trim().url().default("https://api.groq.com/openai/v1"),
  // Must support tool (function) calling. openai/gpt-oss-120b is Groq's
  // strongest tool-calling model available on this account; the Llama 3
  // models have been retired there.
  ASSISTANT_MODEL: z.string().trim().min(1).default("openai/gpt-oss-120b"),
  // Reads attached receipts and invoices (images, and the text of PDFs) —
  // must accept image input. Same provider and key as ASSISTANT_MODEL; the
  // chat model only ever sees what this one read, as text.
  ASSISTANT_VISION_MODEL: z.string().trim().min(1).default("qwen/qwen3.8-27b"),
  // The assistant's knowledge base (modules/knowledge). Embeddings run
  // locally; the model is downloaded once into the cache directory
  // (relative to the backend's working directory).
  KNOWLEDGE_EMBEDDING_MODEL: z.string().trim().min(1).default("onnx-community/embeddinggemma-300m-ONNX"),
  KNOWLEDGE_MODEL_CACHE: z.string().trim().min(1).default(".cache/models"),
  /** "false" turns the knowledge base off (no model download, no indexing) — e.g. on a server too small for it. */
  KNOWLEDGE_ENABLED: z.enum(["true", "false"]).default("true").transform((value) => value === "true"),
  // The provider's tokens-per-minute limit for ASSISTANT_MODEL. Each agent
  // step is sized to fit under it (prompt + reply room), because Groq
  // refuses any single request bigger than the limit. 8000 is Groq's free
  // tier; raise it on a paid tier for longer replies and less compaction.
  ASSISTANT_TOKENS_PER_MINUTE: z.coerce.number().int().min(2000).default(8000),
  /** Sent as reasoning_effort when set — for reasoning models such as gpt-oss. Leave unset for models that reject it. */
  ASSISTANT_REASONING_EFFORT: z.enum(["low", "medium", "high"]).optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:");
  console.error(parsed.error.flatten().fieldErrors);
  throw new Error("Environment validation failed — check your .env file against .env.example");
}

export const env = {
  ...parsed.data,
  /** The key the assistant actually uses. */
  ASSISTANT_KEY: parsed.data.ASSISTANT_API_KEY ?? parsed.data.GROQ_API_KEY,
};
