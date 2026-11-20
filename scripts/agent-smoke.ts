import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { getTag, tags, chatModel, buildVectorIndex } from "../server/ollama.ts";
import { research } from "../server/research.ts";
import { sample } from "../src/fixture.ts";
import type { ResearchResult } from "../src/agent.ts";
import { fingerprint } from "../src/workspace.ts";

const runs: ResearchResult[] = [];
for (const itemId of ["d01", "m01", "u03"]) {
  const test = sample.cases.find((item) => item.id === itemId)!;
  const result = await research(sample, test.question, "hybrid", 4);
  console.log(test.question);
  console.log(result.trace.map((step) => step.stage).join(" → "));
  for (const citation of result.answer.citations)
    console.log(`${citation.passage.docId}: ${citation.quote}`);
  const sources = new Set(
    result.answer.citations.map((item) => item.passage.docId),
  );
  if (test.relevant.length) {
    for (const id of test.relevant) assert(sources.has(id), `Expected ${id}.`);
  } else {
    assert.equal(
      result.answer.citations.length,
      0,
      "Expected the agent to abstain.",
    );
    console.log("Abstained.");
  }
  runs.push(result);
}
if (process.argv.includes("--record")) {
  const chat = getTag(await tags(), chatModel);
  const index = await buildVectorIndex(sample);
  const replay = {
    schema: 1,
    fingerprint: await fingerprint(sample),
    chatModel,
    chatModelDigest: chat?.digest,
    embedModel: index.model,
    embedModelDigest: index.modelDigest,
    ranker: "hybrid",
    k: 4,
    runs,
  };
  await writeFile(
    new URL("../fixtures/agent-runs.json", import.meta.url),
    JSON.stringify(replay, null, 2) + "\n",
  );
  console.log(`Recorded ${runs.length} successful checks for the hosted demo.`);
}
