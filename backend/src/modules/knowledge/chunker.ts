/**
 * Splits a document's text into chunks for the knowledge index. Pure — no
 * DB or model access — so it's unit-testable.
 *
 * Chunks are kept to ~700 characters: one clause or a few related lines,
 * so a hit points at the passage that answers the question, and five hits
 * stay small enough to hand the model (every token counts against the
 * provider's per-minute budget). Splits prefer
 * paragraph, then sentence, then word boundaries; consecutive chunks share
 * a short overlap so a fact straddling a boundary is still whole in one.
 */

export interface ChunkOptions {
  maxChars?: number;
  overlapChars?: number;
}

const SENTENCE_END = /(?<=[.!?؟。])\s+/u;

function normalize(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Pieces no longer than maxChars, cut at the gentlest boundary available. */
function pieces(text: string, maxChars: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split(/\n\s*\n/)) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;
    if (trimmed.length <= maxChars) {
      out.push(trimmed);
      continue;
    }
    for (const sentence of trimmed.split(SENTENCE_END)) {
      if (sentence.length <= maxChars) {
        out.push(sentence);
        continue;
      }
      // A run-on "sentence" (a table row, a list without punctuation): cut between words.
      let current = "";
      for (const word of sentence.split(/\s+/)) {
        if (current && current.length + 1 + word.length > maxChars) {
          out.push(current);
          current = "";
        }
        current = current ? `${current} ${word}` : word.slice(0, maxChars);
      }
      if (current) out.push(current);
    }
  }
  return out;
}

/** The last ~n characters of a chunk, starting at a word boundary — carried into the next chunk. */
function tail(text: string, n: number): string {
  if (n <= 0 || text.length <= n) return n > 0 ? text : "";
  const cut = text.slice(-n);
  const space = cut.indexOf(" ");
  return space >= 0 ? cut.slice(space + 1) : cut;
}

export function chunkText(text: string, options: ChunkOptions = {}): string[] {
  const maxChars = options.maxChars ?? 700;
  const overlapChars = Math.min(options.overlapChars ?? 100, Math.floor(maxChars / 3));
  const normalized = normalize(text);
  if (!normalized) return [];

  const chunks: string[] = [];
  let current = "";
  for (const piece of pieces(normalized, maxChars)) {
    if (!current) {
      current = piece;
      continue;
    }
    if (current.length + 2 + piece.length <= maxChars) {
      current = `${current}\n${piece}`;
      continue;
    }
    chunks.push(current);
    const carried = tail(current, overlapChars);
    current = carried && carried.length + 1 + piece.length <= maxChars ? `${carried} ${piece}` : piece;
  }
  if (current) chunks.push(current);
  return chunks;
}
