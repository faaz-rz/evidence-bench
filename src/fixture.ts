import fixture from "../fixtures/workspace.json" with { type: "json" };
import embeddings from "../fixtures/vectors.json" with { type: "json" };
import type { VectorIndex } from "./types.ts";
import { readWorkspace } from "./workspace.ts";

export const sample = readWorkspace(fixture);
export const sampleVectors = embeddings as VectorIndex;
