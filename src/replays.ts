import replays from "../fixtures/agent-runs.json" with { type: "json" };
import type { ResearchResult } from "./agent.ts";
import { sampleVectors } from "./fixture.ts";

export const recorded =
  replays.fingerprint === sampleVectors.fingerprint
    ? (replays.runs as ResearchResult[])
    : [];
