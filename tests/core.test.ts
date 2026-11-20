import assert from "node:assert/strict";
import { test } from "node:test";
import {
  offlineResearch,
  passagesToCitations,
  verifyCitationIds,
} from "../src/agent.ts";
import { compare, metrics } from "../src/benchmark.ts";
import { sample, sampleVectors } from "../src/fixture.ts";
import { cosine, searchIndex } from "../src/retrieval.ts";
import type { Hit, Passage } from "../src/types.ts";
import { chunk, fingerprint, readWorkspace } from "../src/workspace.ts";

const hit = (docId: string, part = 1): Hit => ({
  passage: {
    id: `${docId}:${part}`,
    title: docId,
    docId,
    text: "",
    heading: "Test",
  },
  score: 1,
});

test("sample contains 36 cases and its embedded vectors carry the real corpus fingerprint", async () => {
  assert.equal(sample.cases.length, 36);
  assert.equal(sample.documents.length, 18);
  assert.equal(await fingerprint(sample), sampleVectors.fingerprint);
  assert.equal(sampleVectors.dimensions, 768);
  assert.match(sampleVectors.modelDigest ?? "", /^[a-f0-9]{64}$/);
  assert.equal(
    Object.keys(sampleVectors.passages).length,
    chunk(sample.documents).length,
  );
  assert.equal(Object.keys(sampleVectors.queries).length, 36);
});

test("compares all labelled cases and treats unsupported probes as unscored", async () => {
  const first = await compare(sample, sampleVectors, 3, "bm25", "hybrid");
  const second = await compare(sample, sampleVectors, 3, "bm25", "hybrid");
  assert.deepEqual(first, second);
  assert.equal(first.comparable, 30);
  assert.equal(first.unsupported, 6);
  assert.equal(first.improved + first.tied + first.regressed, 30);
  assert(
    first.averages.candidate.ndcg >= 0 && first.averages.candidate.ndcg <= 1,
  );
  assert(
    first.cases
      .filter((row) => row.item.kind === "unsupported")
      .every((row) => row.delta === null),
  );
});

test("retrieval metrics account for ranking, cutoff, and duplicate documents", () => {
  const ranked = [hit("x"), hit("b"), hit("b", 2), hit("a")];
  const score = metrics(ranked, ["a", "b"], 3)!;
  assert.equal(score.recall, 0.5);
  assert.equal(score.reciprocalRank, 0.5);
  assert.equal(score.ndcg, 1 / Math.log2(3) / (1 + 1 / Math.log2(3)));
  assert.equal(metrics(ranked, [], 3), null);
  assert.deepEqual(metrics(ranked, ["z"], 3), {
    recall: 0,
    ndcg: 0,
    reciprocalRank: 0,
  });
});

test("the engine keeps one passage per document and records fusion channel ranks", () => {
  const docs = chunk(sample.documents);
  const index = searchIndex(docs, sampleVectors);
  const item = sample.cases.find((item) => item.id === "d01")!;
  const hits = index.rank(
    item.question,
    "hybrid",
    5,
    sampleVectors.queries[item.id],
  );
  assert.equal(new Set(hits.map((h) => h.passage.docId)).size, hits.length);
  assert(hits.some((h) => h.denseRank && h.lexicalRank));
  assert.equal(index.rank("wombats in outer space", "bm25", 5).length, 0);
});

test("cosine handles zero vectors and incompatible dimensions", () => {
  assert.equal(cosine([1, 0], [-2, 0]), -1);
  assert.equal(cosine([0, 1], [0, 1]), 1);
  assert.equal(cosine([0, 0], [1, 0]), 0);
  assert.throws(() => cosine([1, 0], [1]), /dimensions/);
});

test("different text invalidates bundled vectors and a custom corpus can compare lexical methods", async () => {
  const revised = structuredClone(sample);
  revised.documents[0].sections[0].text += " Updated policy.";
  await assert.rejects(
    compare(revised, sampleVectors, 3, "bm25", "hybrid"),
    /different workspace/,
  );
  const run = await compare(revised, undefined, 3, "term", "bm25");
  assert.equal(run.model, null);
  assert.equal(run.comparable, 30);
});

test("workspace validator rejects unknown gold IDs and unsupported cases with labels", () => {
  const wrongDoc = structuredClone(sample);
  wrongDoc.cases[0].relevant = ["absent"];
  assert.throws(() => readWorkspace(wrongDoc), /Unknown relevant document/);
  const wrongCase = structuredClone(sample);
  wrongCase.cases[0].kind = "unsupported";
  assert.throws(() => readWorkspace(wrongCase), /Incorrect relevance/);
});

test("long passages preserve bounded overlap and stable IDs", () => {
  const text = Array.from(
    { length: 300 },
    (_, i) => `word${i.toString().padStart(3, "0")}`,
  ).join(" ");
  const doc = {
    id: "repeat",
    title: "Repeated",
    sections: [{ heading: "Main", text }],
  };
  const passages = chunk([doc]);
  assert(passages.length > 2);
  assert(passages.every((p) => p.text.length <= 600));
  assert.equal(passages[1].id, "repeat:1.2");
  const overlapStart = text.indexOf(passages[1].text);
  const overlap = passages[0].text.slice(overlapStart);
  assert(overlap.length >= 59 && overlap.length <= 80);
  assert(passages[1].text.startsWith(overlap));
});

test("evidence verifier rejects fabricated IDs, duplicate IDs and corrupted source offsets", () => {
  const passage: Passage = {
    id: "p",
    title: "Policy",
    docId: "terms",
    heading: "General",
    text: "One verified sentence has a source. Here is the second eligible sentence.",
  };
  const candidates = passagesToCitations([{ passage, score: 1 }]);
  assert.equal(candidates.length, 2);
  const citations = verifyCitationIds(["E2"], candidates)!;
  assert.equal(citations[0].quote, "Here is the second eligible sentence.");
  assert.equal(
    passage.text.slice(citations[0].start, citations[0].end),
    citations[0].quote,
  );
  assert.equal(verifyCitationIds(["FAKE"], candidates), null);
  assert.equal(verifyCitationIds(["E1", "E1"], candidates), null);
  assert.equal(
    verifyCitationIds(["E1"], [{ ...candidates[0], start: 3 }]),
    null,
  );
});

test("offline research emits real source offsets and uses lexical search for a new browser question", () => {
  const question = sample.cases[0].question;
  const result = offlineResearch(sample, question, "hybrid", 4, sampleVectors);
  assert.equal(result.answer.mode, "extractive");
  assert(
    result.answer.citations.some(
      (citation) => citation.passage.docId === "billing",
    ),
  );
  assert(
    result.answer.citations.every(
      (citation) =>
        citation.passage.text.slice(citation.start, citation.end) ===
        citation.quote,
    ),
  );
  const freeform = offlineResearch(
    sample,
    "Are unicorns real?",
    "hybrid",
    4,
    sampleVectors,
  );
  assert.match(freeform.trace[1].detail, /BM25/);
  assert.equal(freeform.answer.citations.length, 0);
});

test("release gate fails when a weaker pipeline misses the score thresholds", async () => {
  const { gateFailures, readGate } = await import("../src/gate.ts");
  const gate = readGate({
    minimumCases: 30,
    minNdcg: 0.92,
    minRecall: 0.95,
    maxRegressions: 1,
  });
  const expected = await compare(sample, sampleVectors, 3, "bm25", "dense");
  const weaker = await compare(sample, sampleVectors, 3, "bm25", "hybrid");
  assert.deepEqual(gateFailures(expected, gate), []);
  assert(
    gateFailures(weaker, gate).some((failure) => failure.startsWith("nDCG")),
  );
  assert.throws(
    () => readGate({ ...gate, maxRegressions: -1 }),
    /non-negative integer/,
  );
});

test("recorded model replays resolve to exact passages from the same fixture", async () => {
  const { recorded } = await import("../src/replays.ts");
  const passages = new Map(
    chunk(sample.documents).map((passage) => [passage.id, passage]),
  );
  assert.equal(recorded.length, 3);
  for (const run of recorded) {
    assert.equal(run.answer.mode, "ollama");
    assert(sample.cases.some((item) => item.question === run.question));
    assert.equal(run.trace.at(0)?.stage, "Plan");
    assert.equal(run.trace.at(-1)?.stage, "Finish");
    for (const citation of run.answer.citations) {
      assert.equal(
        passages
          .get(citation.passage.id)
          ?.text.slice(citation.start, citation.end),
        citation.quote,
      );
    }
  }
  assert(
    recorded.some(
      (run) =>
        run.answer.citations.length === 0 &&
        run.trace.some((step) => step.stage === "Retry"),
    ),
  );
  assert(
    recorded.some(
      (run) =>
        new Set(run.answer.citations.map((citation) => citation.passage.docId))
          .size === 2,
    ),
  );
});
