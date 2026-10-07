/**
 * Matches the name printed on a receipt ("CAIRO FABRICS CO", "مطبعة النور
 * للتغليف") against the ledger's suppliers ("Cairo Fabrics", "مطبعه
 * النور"). Pure — no DB access — so it's unit-testable on its own.
 *
 * Deliberately simple and explainable: names are normalized (case, Arabic
 * letter variants, diacritics, company suffixes), split into words, and
 * scored by how many of the shorter name's words the other one contains.
 * It only proposes candidates; the assistant still asks when a match isn't
 * clear-cut, and the admin sees the supplier on the card before confirming.
 */

/** Words that say what kind of entity it is, not which one. */
const NOISE_WORDS = new Set([
  "co", "company", "corp", "corporation", "inc", "ltd", "llc", "limited", "est", "establishment", "group", "the", "and", "for", "of",
  "sae", "s.a.e", "شركة", "شركه", "مؤسسة", "مؤسسه", "مجموعة", "مجموعه", "و", "لل", "ال",
]);

/** Arabic letters with several common spellings collapse to one; diacritics and tatweel go. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\u064B-\u0652\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function words(name: string): string[] {
  return normalizeName(name)
    .split(" ")
    // A leading definite article ("ال" / "لل") isn't part of the name: النور ≈ نور.
    .map((word) => (/^(ال|لل)\p{L}{2,}/u.test(word) ? word.replace(/^(ال|لل)/, "") : word))
    .filter((word) => word && !NOISE_WORDS.has(word));
}

export interface MatchCandidate<T> {
  entity: T;
  /** 0..1 — the share of the shorter name's words found in the other. */
  score: number;
  /**
   * Every word of the shorter name matched, and it isn't one generic word
   * standing in for a longer name ("Hassan" vs "Hassan Stitching
   * Workshop" is only a possible match — there may be several Hassans).
   */
  strong: boolean;
}

/**
 * Ledger entities whose name plausibly is `printedName`, best first. A
 * word matches when equal, or when one starts with the other and the
 * shorter is at least 4 letters ("fabric" / "fabrics"). Only candidates
 * sharing at least half the shorter name's words are returned.
 */
export function matchLedgerEntities<T extends { name: string }>(printedName: string, entities: T[], limit = 3): MatchCandidate<T>[] {
  const target = words(printedName);
  if (target.length === 0) return [];

  const sameWord = (a: string, b: string) =>
    a === b || (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a)));

  return entities
    .flatMap((entity) => {
      const candidate = words(entity.name);
      if (candidate.length === 0) return [];
      const [shorter, longer] = candidate.length <= target.length ? [candidate, target] : [target, candidate];
      const matched = shorter.filter((word) => longer.some((other) => sameWord(word, other))).length;
      const score = matched / shorter.length;
      const strong = matched === shorter.length && (shorter.length >= 2 || longer.length === 1);
      return score >= 0.5 ? [{ entity, score, strong }] : [];
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
