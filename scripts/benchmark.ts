import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { compare } from "../src/benchmark.ts";
import { sample, sampleVectors } from "../src/fixture.ts";
import { gateFailures, readGate } from "../src/gate.ts";
import type { Ranker, VectorIndex } from "../src/types.ts";
import { InputError, readWorkspace } from "../src/workspace.ts";

const { values } = parseArgs({
  options: {
    baseline: { type: "string", default: "bm25" },
    candidate: { type: "string", default: "dense" },
    "top-k": { type: "string", default: "3" },
    workspace: { type: "string" },
    vectors: { type: "string" },
    gate: { type: "string" },
    out: { type: "string" },
  },
});

function ranker(value: string): Ranker {
  if (
    value === "term" ||
    value === "bm25" ||
    value === "dense" ||
    value === "hybrid"
  )
    return value;
  throw new InputError(`Unknown ranker ${value}.`);
}

async function readJson(path: string) {
  return JSON.parse(await readFile(path, "utf8"));
}

try {
  const k = Number(values["top-k"]);
  const workspace = values.workspace
    ? readWorkspace(await readJson(values.workspace))
    : sample;
  const vectors = values.vectors
    ? ((await readJson(values.vectors)) as VectorIndex)
    : values.workspace
      ? undefined
      : sampleVectors;
  const run = await compare(
    workspace,
    vectors,
    k,
    ranker(values.baseline),
    ranker(values.candidate),
  );
  console.table(run.averages);
  console.log(
    `${run.comparable} scored, ${run.unsupported} unsupported. Improved ${run.improved}, tied ${run.tied}, regressed ${run.regressed}.`,
  );
  if (values.out)
    await writeFile(values.out, JSON.stringify(run, null, 2) + "\n");
  if (values.gate) {
    const failures = gateFailures(run, readGate(await readJson(values.gate)));
    if (failures.length) {
      failures.forEach((failure) => console.error(failure));
      process.exitCode = 2;
    } else console.log("Retrieval gate passed.");
  }
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}
