import { sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { embedQuery, toVectorLiteral } from "./embedder.js";
import { ensureRecordsFresh } from "./records.js";

/**
 * Hybrid retrieval over the knowledge index. Two rankings, fused:
 *  - by meaning: cosine distance between the query's embedding and each
 *    chunk's (finds "قماش" for "fabric supplier");
 *  - by words: full-text match with OR semantics, plus trigram word
 *    similarity for names, SKUs and typos ("Cairo Fabrik").
 * Reciprocal-rank fusion merges them without having to calibrate one score
 * against the other: a chunk near the top of either list rises.
 */

export interface KnowledgeHit {
  /** Short citation handle for the model, e.g. "K3". Stable only within one result list. */
  ref: string;
  documentId: string;
  title: string;
  sourceType: string;
  sourceId: string | null;
  brandId: string | null;
  ledgerEntityId: string | null;
  fileUrl: string | null;
  content: string;
  /** Cosine similarity, 0..1 — null when the chunk only matched by words. */
  similarity: number | null;
  score: number;
}

export interface SearchOptions {
  /** Restrict to one workspace (plus company-wide documents). Undefined/null = every workspace. */
  brandId?: string | null;
  /** e.g. ["upload"] for documents only, ["expense","revenue"] for money records. */
  sourceTypes?: string[];
  limit?: number;
}

const CANDIDATES = 30;

/**
 * Words that carry no meaning for a keyword match — question words,
 * pronouns, connectives, in English and Arabic (MSA and Egyptian). Left in,
 * "who supplies our zippers?" would OR-match every chunk containing "our".
 */
const STOPWORDS = new Set(
  (
    "a an the and or of to in on at for from by with about as is are was were be been do does did have has had " +
    "what which who whom whose when where why how much many any some all our we us you your i me my it its this that " +
    "these those there their they them can could would should will shall may might please tell show give find get " +
    "list me any do did doesnt dont not no yes than then so if into over last next per " +
    "في من على إلى الى عن مع هل ما ماذا لماذا كيف كم متى أين اين مين ايه إيه امتى إمتى فين ازاي إزاي " +
    "هو هي هم احنا إحنا انا أنا انت إنت ده دي دول هذا هذه ذلك تلك اللي التي الذي الذين و او أو ثم لا مش بس " +
    "عندنا عندي كان كانت يكون بتاع بتاعة بتاعنا قد لقد كل بعض أي اي"
  ).split(/\s+/),
);

/** The words worth matching literally; null when nothing is left after the filler words. */
export function keywordTerms(query: string): string | null {
  const terms = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}-]+/u)
    .filter((term) => term.length >= 2 && !STOPWORDS.has(term));
  return terms.length > 0 ? terms.join(" ") : null;
}

/** A name, SKU or number rather than a question: exact matching should count as much as meaning. */
export function looksLikeIdentifier(query: string): boolean {
  const words = query.trim().split(/\s+/);
  return words.length <= 3 || /\b[A-Za-z]{2,}-[A-Za-z0-9-]+\b/.test(query) || /\d{4,}/.test(query);
}
/** The usual RRF constant: damps the advantage of rank 1 over rank 2. */
const RRF_K = 60;

interface Candidate {
  chunk_id: string;
  document_id: string;
  content: string;
  similarity?: number;
}

interface FusedCandidate {
  chunk_id: string;
  document_id: string;
  content: string;
  score: number;
  similarity: number | null;
}

/** Pure: fuses ranked candidate lists, each with a weight. Exported for tests. */
export function fuseRankings(lists: { candidates: Candidate[]; weight: number }[], limit: number): FusedCandidate[] {
  const fused = new Map<string, FusedCandidate>();
  for (const { candidates, weight } of lists) {
    candidates.forEach((candidate, rank) => {
      const entry = fused.get(candidate.chunk_id) ?? {
        chunk_id: candidate.chunk_id,
        document_id: candidate.document_id,
        content: candidate.content,
        score: 0,
        similarity: null,
      };
      entry.score += weight / (RRF_K + rank + 1);
      if (candidate.similarity !== undefined) entry.similarity = candidate.similarity;
      fused.set(candidate.chunk_id, entry);
    });
  }
  return [...fused.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

function filters(options: SearchOptions) {
  const brand = options.brandId ? sql`and (c.brand_id = ${options.brandId} or c.brand_id is null)` : sql``;
  const types =
    options.sourceTypes && options.sourceTypes.length > 0
      ? sql`and c.source_type in (${sql.join(options.sourceTypes.map((type) => sql`${type}`), sql`, `)})`
      : sql``;
  return sql`${brand} ${types}`;
}

export async function searchKnowledge(query: string, options: SearchOptions = {}): Promise<KnowledgeHit[]> {
  const text = query.trim().slice(0, 500);
  if (!text) return [];
  await ensureRecordsFresh();
  const limit = Math.min(options.limit ?? 8, 20);
  const vector = toVectorLiteral(await embedQuery(text));
  const where = filters(options);
  const terms = keywordTerms(text);
  const identifier = looksLikeIdentifier(text);

  const [byMeaning, byWords] = await Promise.all([
    db.execute(sql`
      select c.id as chunk_id, c.document_id, c.content, 1 - (c.embedding <=> ${vector}::vector) as similarity
      from kb_chunks c where true ${where}
      order by c.embedding <=> ${vector}::vector limit ${CANDIDATES}`),
    // plainto_tsquery ANDs the words; a question rarely contains every word
    // of the passage that answers it, so the ANDs become ORs and ts_rank
    // rewards chunks that match more of them.
    // Trigram similarity only for short, name-like queries (it's what
    // catches "Cairo Fabriks"); for a whole question it's noise.
    terms || identifier
      ? db.execute(sql`
      with q as (select nullif(replace(plainto_tsquery('simple', ${terms ?? ""})::text, '&', '|'), '')::tsquery as tsq)
      select c.id as chunk_id, c.document_id, c.content
      from kb_chunks c, q
      where ((q.tsq is not null and c.tsv @@ q.tsq) or (${identifier} and ${text} <% c.content)) ${where}
      order by greatest(coalesce(ts_rank(c.tsv, q.tsq), 0), case when ${identifier} then word_similarity(${text}, c.content) else 0 end) desc
      limit ${CANDIDATES}`)
      : Promise.resolve({ rows: [] }),
  ]);

  // For a question, meaning leads and exact words break ties; for a name or
  // SKU, an exact match counts as much as a near meaning.
  const fused = fuseRankings(
    [
      { candidates: (byMeaning.rows as unknown as Candidate[]).map((row) => ({ ...row, similarity: Number(row.similarity) })), weight: 1 },
      { candidates: byWords.rows as unknown as Candidate[], weight: identifier ? 1 : 0.5 },
    ],
    limit,
  );
  if (fused.length === 0) return [];

  const documents = await db.execute(sql`
    select id, title, source_type, source_id, brand_id, ledger_entity_id, file_url
    from kb_documents where id in (${sql.join([...new Set(fused.map((hit) => hit.document_id))].map((id) => sql`${id}`), sql`, `)})`);
  const byId = new Map((documents.rows as Record<string, unknown>[]).map((row) => [row.id as string, row]));

  return fused.flatMap((hit, index) => {
    const doc = byId.get(hit.document_id);
    if (!doc) return [];
    return [
      {
        ref: `K${index + 1}`,
        documentId: hit.document_id,
        title: doc.title as string,
        sourceType: doc.source_type as string,
        sourceId: (doc.source_id as string | null) ?? null,
        brandId: (doc.brand_id as string | null) ?? null,
        ledgerEntityId: (doc.ledger_entity_id as string | null) ?? null,
        fileUrl: (doc.file_url as string | null) ?? null,
        content: hit.content,
        similarity: hit.similarity,
        score: hit.score,
      },
    ];
  });
}
