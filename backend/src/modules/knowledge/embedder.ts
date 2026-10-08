import path from "node:path";
import { env } from "../../config/env.js";

/**
 * Text → 384-dim vectors, computed locally (no API key, no per-call cost).
 *
 * Default model: EmbeddingGemma-300m (8-bit), truncated from 768 to 384
 * dimensions (it's trained so the leading dimensions stand on their own).
 * Picked by a probe of 14 Arabic/English business questions against
 * supplier, product, expense, contract and policy passages: it ranked the
 * right passage first for all 14, across languages ("إمتى بيوصل القماش
 * للمصنع؟" → the English contract's delivery clause), where
 * paraphrase-multilingual-MiniLM managed 9 and gte-multilingual-base 12.
 * Cost: ~300MB download on first use (into KNOWLEDGE_MODEL_CACHE) and
 * ~0.3s per query on CPU.
 *
 * Any other sentence-transformers model can be set with
 * KNOWLEDGE_EMBEDDING_MODEL (mean pooling, no prefixes); its vectors are
 * cut or must already be 384-dim to fit the column. Changing the model
 * means re-indexing: vectors from different models aren't comparable.
 */

export const EMBEDDING_DIMENSIONS = 384;
const BATCH_SIZE = 16;

/** query vs. document embeddings: asymmetric models want to know which side a text is on. */
type Side = "query" | "document";
type Encoder = (texts: string[], side: Side) => Promise<number[][]>;

let loading: Promise<Encoder> | null = null;
/** Calls run one at a time: the ONNX session is shared, and contention only makes each call slower. */
let queue: Promise<unknown> = Promise.resolve();

function truncateAndNormalize(vector: number[]): number[] {
  const cut = vector.slice(0, EMBEDDING_DIMENSIONS);
  const length = Math.sqrt(cut.reduce((sum, value) => sum + value * value, 0)) || 1;
  return cut.map((value) => value / length);
}

function loadModel(): Promise<Encoder> {
  loading ??= (async (): Promise<Encoder> => {
    // Imported on first use: the runtime is large and most requests never need it.
    const transformers = await import("@huggingface/transformers");
    transformers.env.cacheDir = path.resolve(process.cwd(), env.KNOWLEDGE_MODEL_CACHE);
    const model = env.KNOWLEDGE_EMBEDDING_MODEL;
    const started = Date.now();
    let encoder: Encoder;

    if (/embeddinggemma/i.test(model)) {
      // The ONNX export carries Gemma's own pooling + projection as a
      // `sentence_embedding` output, and the model expects these task prompts.
      const tokenizer = await transformers.AutoTokenizer.from_pretrained(model);
      const network = await transformers.AutoModel.from_pretrained(model, { dtype: "q8" });
      encoder = async (texts, side) => {
        const prompted = texts.map((text) => (side === "query" ? `task: search result | query: ${text}` : `title: none | text: ${text}`));
        const inputs = await tokenizer(prompted, { padding: true, truncation: true, max_length: 512 });
        const { sentence_embedding } = (await network(inputs)) as { sentence_embedding: { tolist(): number[][] } };
        return sentence_embedding.tolist().map(truncateAndNormalize);
      };
    } else {
      const extractor = (await transformers.pipeline("feature-extraction", model, { dtype: "q8" })) as unknown as (
        texts: string[],
        options: { pooling: "mean"; normalize: boolean },
      ) => Promise<{ tolist(): number[][] }>;
      encoder = async (texts) => (await extractor(texts, { pooling: "mean", normalize: true })).tolist().map(truncateAndNormalize);
    }

    console.log(`Knowledge: embedding model ${model} ready in ${Date.now() - started}ms`);
    return encoder;
  })().catch((err: unknown) => {
    loading = null; // a failed download is retried on the next call
    throw err;
  });
  return loading;
}

/** Starts the model download/load in the background at boot, so the first search doesn't wait for it. */
export function warmUpEmbedder(): void {
  loadModel().catch((err: unknown) => console.error("Knowledge: couldn't load the embedding model:", err instanceof Error ? err.message : err));
}

function encode(texts: string[], side: Side): Promise<number[][]> {
  if (texts.length === 0) return Promise.resolve([]);
  const run = queue.then(async () => {
    const encoder = await loadModel();
    const vectors: number[][] = [];
    for (let start = 0; start < texts.length; start += BATCH_SIZE) {
      vectors.push(...(await encoder(texts.slice(start, start + BATCH_SIZE), side)));
    }
    return vectors;
  });
  queue = run.catch(() => undefined);
  return run;
}

/** For indexing: chunks of documents and records. */
export function embedDocuments(texts: string[]): Promise<number[][]> {
  return encode(texts, "document");
}

/** For searching: the question or search phrase. */
export async function embedQuery(text: string): Promise<number[]> {
  const [vector] = await encode([text], "query");
  return vector!;
}

/** pgvector's text form, for a parameter cast with ::vector. */
export function toVectorLiteral(vector: number[]): string {
  return `[${vector.map((value) => (Number.isFinite(value) ? value.toFixed(6) : "0")).join(",")}]`;
}
