import type { Benchmark } from "./benchmark.ts";
import { InputError } from "./workspace.ts";

export interface Gate {
  minimumCases: number;
  minNdcg: number;
  minRecall: number;
  maxRegressions: number;
}

export function readGate(raw: unknown): Gate {
  if (typeof raw !== "object" || raw === null)
    throw new InputError("Gate configuration must be an object.");
  const gate = raw as Partial<Gate>;
  for (const key of ["minimumCases", "maxRegressions"] as const) {
    const value = gate[key];
    if (!Number.isInteger(value) || value! < 0)
      throw new InputError(`Gate ${key} must be a non-negative integer.`);
  }
  for (const key of ["minNdcg", "minRecall"] as const) {
    const value = gate[key];
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > 1
    ) {
      throw new InputError(`Gate ${key} must be between zero and one.`);
    }
  }
  return gate as Gate;
}

export function gateFailures(run: Benchmark, gate: Gate): string[] {
  const score = run.averages.candidate;
  const failures: string[] = [];
  if (run.comparable < gate.minimumCases)
    failures.push(
      `Expected at least ${gate.minimumCases} scored cases, saw ${run.comparable}.`,
    );
  if (score.ndcg < gate.minNdcg)
    failures.push(`nDCG ${score.ndcg.toFixed(3)} is below ${gate.minNdcg}.`);
  if (score.recall < gate.minRecall)
    failures.push(
      `Recall ${score.recall.toFixed(3)} is below ${gate.minRecall}.`,
    );
  if (run.regressed > gate.maxRegressions)
    failures.push(
      `${run.regressed} regressed cases exceeds ${gate.maxRegressions}.`,
    );
  return failures;
}
