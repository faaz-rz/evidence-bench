import type { Hit, Passage, Ranker, VectorIndex } from "./types.ts";
import { InputError } from "./workspace.ts";

const stopWords = new Set(
  "a an and are as at be been but by can did do does for from had has have how i if in into is it its may me my of on or our so than that the their them then there these they this those to up use was were what when where which who will with would you your".split(
    " ",
  ),
);

export function words(text: string): string[] {
  const tokens =
    text
      .normalize("NFKC")
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) ?? [];
  return tokens.filter((token) => token.length > 1 && !stopWords.has(token));
}

type Scored = { passage: Passage; score: number };

const rankOrder = (a: Scored, b: Scored) =>
  b.score - a.score || a.passage.id.localeCompare(b.passage.id, "en");

function uniqueDocuments(ranked: Scored[], limit = 20): Scored[] {
  const seen = new Set<string>();
  const hits: Scored[] = [];
  for (const hit of ranked.sort(rankOrder)) {
    const id = hit.passage.docId;
    if (seen.has(id)) continue;
    hits.push(hit);
    seen.add(id);
    if (hits.length === limit) break;
  }
  return hits;
}

function frequencies(tokens: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  return counts;
}

export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0)
    throw new InputError("Vector dimensions do not agree.");
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] ** 2;
    normB += b[i] ** 2;
  }
  const divisor = Math.sqrt(normA * normB);
  return divisor > 0 ? dot / divisor : 0;
}

export const needsVectors = (ranker: Ranker) =>
  ranker === "dense" || ranker === "hybrid";

export const embeddingText = (passage: Passage) =>
  `${passage.title} / ${passage.heading}\n${passage.text}`;

export function searchIndex(passages: Passage[], vectors?: VectorIndex) {
  const rows = passages.map((passage) => {
    const tokens = words(embeddingText(passage));
    return { passage, tokens: frequencies(tokens), length: tokens.length };
  });
  const avgLength =
    rows.reduce((sum, row) => sum + row.length, 0) / rows.length || 1;
  const documentFrequency = new Map<string, number>();
  for (const row of rows) {
    for (const token of row.tokens.keys())
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
  }

  function keyword(question: string, overlap = false): Scored[] {
    const queries = [...new Set(words(question))];
    const k1 = 1.2;
    const b = 0.75;
    return uniqueDocuments(
      rows
        .map((row) => {
          const score = queries.reduce((sum, term) => {
            const count = row.tokens.get(term) ?? 0;
            const df = documentFrequency.get(term) ?? 0;
            if (!count) return sum;
            if (overlap) return sum + 1;
            const idf = Math.log(1 + (rows.length - df + 0.5) / (df + 0.5));
            const normalized =
              count + k1 * (1 - b + (b * row.length) / avgLength);
            return sum + (idf * count * (k1 + 1)) / normalized;
          }, 0);
          return { passage: row.passage, score };
        })
        .filter((item) => item.score > 0),
    );
  }

  function dense(vector: number[]): Scored[] {
    if (!vectors)
      throw new InputError(
        "A semantic index is required for dense or hybrid retrieval.",
      );
    return uniqueDocuments(
      passages.map((passage) => {
        const embedding = vectors.passages[passage.id];
        if (!embedding)
          throw new InputError(`Missing vector for ${passage.id}.`);
        return { passage, score: cosine(embedding, vector) };
      }),
    );
  }

  function rank(
    question: string,
    method: Ranker,
    topK: number,
    queryVector?: number[],
  ): Hit[] {
    if (!Number.isInteger(topK) || topK < 1 || topK > 20)
      throw new InputError("Top K must be between 1 and 20.");
    if (!needsVectors(method))
      return keyword(question, method === "term")
        .slice(0, topK)
        .map((hit, i) => ({ ...hit, lexicalRank: i + 1 }));
    if (!queryVector)
      throw new InputError("This question requires a semantic query vector.");
    const semantic = dense(queryVector);
    if (method === "dense")
      return semantic
        .slice(0, topK)
        .map((hit, i) => ({ ...hit, denseRank: i + 1 }));

    // Fusion operates at document level. Use the passage scoring best across channels.
    const fusion = new Map<string, Hit>();
    const k = 60;
    const lexical = keyword(question);
    for (const [i, hit] of lexical.entries()) {
      fusion.set(hit.passage.docId, {
        passage: hit.passage,
        score: 1 / (k + i + 1),
        lexicalRank: i + 1,
      });
    }
    for (const [i, hit] of semantic.entries()) {
      const existing = fusion.get(hit.passage.docId);
      const points = 1 / (k + i + 1);
      const passage =
        !existing || i + 1 <= existing.lexicalRank!
          ? hit.passage
          : existing.passage;
      fusion.set(hit.passage.docId, {
        ...existing,
        passage,
        score: (existing?.score ?? 0) + points,
        denseRank: i + 1,
      });
    }
    return [...fusion.values()].sort(rankOrder).slice(0, topK);
  }

  return { rank };
}
