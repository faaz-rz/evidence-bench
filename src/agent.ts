import { needsVectors, searchIndex, words } from "./retrieval.ts";
import type {
  Answer,
  Citation,
  Hit,
  Ranker,
  VectorIndex,
  Workspace,
} from "./types.ts";
import { chunk, text } from "./workspace.ts";

export interface EvidenceCandidate extends Citation {
  id: string;
}
export interface TraceStep {
  stage: "Plan" | "Retrieve" | "Verify" | "Retry" | "Finish";
  detail: string;
  queries?: string[];
  hits?: Hit[];
}
export interface ResearchResult {
  question: string;
  answer: Answer;
  trace: TraceStep[];
  hits: Hit[];
}

export function passagesToCitations(hits: Hit[]): EvidenceCandidate[] {
  const candidates: EvidenceCandidate[] = [];
  const seen = new Set<string>();
  for (const { passage } of hits) {
    if (seen.has(passage.id)) continue;
    seen.add(passage.id);
    const sentences = new Intl.Segmenter("en", {
      granularity: "sentence",
    }).segment(passage.text);
    for (const item of sentences) {
      const quote = item.segment.trim();
      if (quote.length < 20 || quote.length > 450) continue;
      const start = item.index + item.segment.indexOf(quote);
      candidates.push({
        id: `E${candidates.length + 1}`,
        passage,
        start,
        end: start + quote.length,
        quote,
      });
      if (candidates.length === 24) return candidates;
    }
  }
  return candidates;
}

export function verifyCitationIds(
  ids: unknown,
  candidates: EvidenceCandidate[],
): Citation[] | null {
  if (
    !Array.isArray(ids) ||
    ids.length < 1 ||
    ids.length > 4 ||
    new Set(ids).size !== ids.length
  )
    return null;
  const byId = new Map(candidates.map((item) => [item.id, item]));
  const citations: Citation[] = [];
  for (const id of ids) {
    if (typeof id !== "string") return null;
    const found = byId.get(id);
    if (
      !found ||
      found.passage.text.slice(found.start, found.end) !== found.quote
    )
      return null;
    citations.push({
      passage: found.passage,
      start: found.start,
      end: found.end,
      quote: found.quote,
    });
  }
  return citations;
}

export function offlineResearch(
  workspace: Workspace,
  question: string,
  ranker: Ranker,
  k: number,
  vectors?: VectorIndex,
): ResearchResult {
  const query = text(question, 500, "Question");
  const item = workspace.cases.find(
    (row) => row.question.trim().toLowerCase() === query.toLowerCase(),
  );
  const queryVector = item ? vectors?.queries[item.id] : undefined;
  const selected = !queryVector && needsVectors(ranker) ? "bm25" : ranker;
  const hits = searchIndex(chunk(workspace.documents), vectors).rank(
    query,
    selected,
    k,
    queryVector,
  );
  const terms = new Set(words(query));
  const scored = passagesToCitations(hits)
    .map((item) => {
      const overlap = new Set(
        words(item.quote).filter((token) => terms.has(token)),
      ).size;
      return { item, overlap };
    })
    .filter(({ overlap }) => overlap >= 2)
    .sort((a, b) => b.overlap - a.overlap);
  const picked = scored.slice(0, 3).map(({ item }) => item);
  const citations = picked.length
    ? (verifyCitationIds(
        picked.map((item) => item.id),
        picked,
      ) ?? [])
    : [];
  return {
    question: query,
    answer: { mode: "extractive", citations },
    hits,
    trace: [
      {
        stage: "Plan",
        detail: "Use the question as a single search query.",
        queries: [query],
      },
      {
        stage: "Retrieve",
        detail: `${hits.length} documents ranked with ${selected === "bm25" ? "BM25" : selected === "term" ? "term overlap" : selected}.`,
        hits,
      },
      {
        stage: "Verify",
        detail:
          "Score sentence overlap and validate the exact text offsets. An overlap match is a candidate for manual review.",
      },
      {
        stage: "Finish",
        detail: citations.length
          ? `Found ${citations.length} candidate excerpts.`
          : "No candidate met the overlap threshold.",
      },
    ],
  };
}
