import { needsVectors, searchIndex } from "./retrieval.ts";
import type { Hit, Ranker, TestCase, VectorIndex, Workspace } from "./types.ts";
import { chunk, fingerprint, InputError } from "./workspace.ts";

export interface Metrics {
  recall: number;
  ndcg: number;
  reciprocalRank: number;
}

export interface CaseResult {
  item: TestCase;
  baseline: { hits: Hit[]; metrics: Metrics | null };
  candidate: { hits: Hit[]; metrics: Metrics | null };
  delta: number | null;
}

export interface Benchmark {
  schema: 1;
  fingerprint: string;
  workspace: string;
  k: number;
  model: string | null;
  modelDigest: string | null;
  dimensions: number | null;
  baseline: Ranker;
  candidate: Ranker;
  cases: CaseResult[];
  averages: { baseline: Metrics; candidate: Metrics };
  comparable: number;
  unsupported: number;
  improved: number;
  tied: number;
  regressed: number;
}

export function metrics(
  hits: Hit[],
  relevant: string[],
  k: number,
): Metrics | null {
  const gold = new Set(relevant);
  if (!gold.size) return null;
  const seen = new Set<string>();
  let retrieved = 0;
  let dcg = 0;
  let reciprocalRank = 0;
  for (const [index, hit] of hits.slice(0, k).entries()) {
    if (!gold.has(hit.passage.docId) || seen.has(hit.passage.docId)) continue;
    seen.add(hit.passage.docId);
    retrieved++;
    dcg += 1 / Math.log2(index + 2);
    reciprocalRank ||= 1 / (index + 1);
  }
  const ideal = Array.from(
    { length: Math.min(k, gold.size) },
    (_, index) => 1 / Math.log2(index + 2),
  );
  return {
    recall: retrieved / gold.size,
    ndcg: dcg / ideal.reduce((sum, value) => sum + value, 0),
    reciprocalRank,
  };
}

function mean(values: Metrics[]): Metrics {
  const average = (key: keyof Metrics) =>
    values.length
      ? values.reduce((sum, value) => sum + value[key], 0) / values.length
      : 0;
  return {
    recall: average("recall"),
    ndcg: average("ndcg"),
    reciprocalRank: average("reciprocalRank"),
  };
}

export async function compare(
  workspace: Workspace,
  vectors: VectorIndex | undefined,
  k: number,
  baseline: Ranker,
  candidate: Ranker,
): Promise<Benchmark> {
  const digest = await fingerprint(workspace);
  if ((needsVectors(baseline) || needsVectors(candidate)) && !vectors)
    throw new InputError(
      "Build a semantic index before benchmarking this pipeline.",
    );
  if (vectors && (vectors.schema !== 1 || vectors.fingerprint !== digest)) {
    throw new InputError(
      "The semantic index belongs to a different workspace.",
    );
  }
  if (!Number.isInteger(k) || k < 1 || k > 10)
    throw new InputError("Benchmark K must be between 1 and 10.");
  const index = searchIndex(chunk(workspace.documents), vectors);
  const cases = workspace.cases.map((item): CaseResult => {
    const query = vectors?.queries[item.id];
    const left = index.rank(item.question, baseline, k, query);
    const right = index.rank(item.question, candidate, k, query);
    const a = metrics(left, item.relevant, k);
    const b = metrics(right, item.relevant, k);
    return {
      item,
      baseline: { hits: left, metrics: a },
      candidate: { hits: right, metrics: b },
      delta: a && b ? b.ndcg - a.ndcg : null,
    };
  });
  const comparable = cases.filter((row) => row.delta !== null);
  const epsilon = 1e-9;
  const improved = comparable.filter((row) => row.delta! > epsilon).length;
  const regressed = comparable.filter((row) => row.delta! < -epsilon).length;
  return {
    schema: 1,
    workspace: workspace.name,
    fingerprint: digest,
    k,
    model: vectors?.model ?? null,
    modelDigest: vectors?.modelDigest ?? null,
    dimensions: vectors?.dimensions ?? null,
    baseline,
    candidate,
    cases,
    comparable: comparable.length,
    unsupported: cases.length - comparable.length,
    improved,
    regressed,
    tied: comparable.length - improved - regressed,
    averages: {
      baseline: mean(comparable.map((row) => row.baseline.metrics!)),
      candidate: mean(comparable.map((row) => row.candidate.metrics!)),
    },
  };
}
