import { embeddingText } from "../src/retrieval.ts";
import type { VectorIndex, Workspace } from "../src/types.ts";
import { chunk, fingerprint } from "../src/workspace.ts";

const base = "http://127.0.0.1:11434";
export const embedModel =
  process.env.EVIDENCE_EMBED_MODEL ?? "nomic-embed-text";
export const chatModel = process.env.EVIDENCE_CHAT_MODEL ?? "qwen3.5:4b";
const instruction = "search_query: ";
const documentInstruction = "search_document: ";

async function ollama(path: string, payload?: unknown): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(base + path, {
      method: payload === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json" },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      redirect: "error",
      signal: AbortSignal.timeout(120_000),
    });
  } catch (error) {
    throw new Error("Could not reach the local Ollama service on port 11434.", {
      cause: error,
    });
  }
  if (!response.ok) {
    const problem = await response.text();
    throw new Error(
      `Ollama returned HTTP ${response.status}: ${problem.slice(0, 240)}`,
    );
  }
  return response.json();
}

export async function tags(): Promise<{ name: string; digest: string }[]> {
  const result = (await ollama("/api/tags")) as {
    models?: { name: string; digest: string }[];
  };
  return result.models ?? [];
}

export const getTag = (
  available: { name: string; digest: string }[],
  model: string,
) =>
  available.find(
    (item) => item.name === (model.includes(":") ? model : model + ":latest"),
  );

async function embed(inputs: string[]): Promise<number[][]> {
  if (!inputs.length) return [];
  const result = (await ollama("/api/embed", {
    model: embedModel,
    input: inputs,
    truncate: false,
    options: { num_ctx: 2048 },
  })) as { embeddings?: number[][] };
  const vectors = result.embeddings;
  const dimensions = vectors?.[0]?.length ?? 0;
  if (
    !vectors ||
    !dimensions ||
    vectors.length !== inputs.length ||
    vectors.some(
      (vector) =>
        vector.length !== dimensions ||
        vector.some((value) => !Number.isFinite(value)),
    )
  ) {
    throw new Error("Ollama returned an invalid embedding matrix.");
  }
  return vectors.map((vector) =>
    vector.map((value) => Math.round(value * 1e6) / 1e6),
  );
}

async function embedBatches(inputs: string[]): Promise<number[][]> {
  const vectors: number[][] = [];
  for (let i = 0; i < inputs.length; i += 32)
    vectors.push(...(await embed(inputs.slice(i, i + 32))));
  return vectors;
}

export async function queryVector(question: string): Promise<number[]> {
  return (await embed([instruction + question]))[0];
}

const indexing = new Map<string, Promise<VectorIndex>>();

export async function buildVectorIndex(
  workspace: Workspace,
): Promise<VectorIndex> {
  const hash = await fingerprint(workspace);
  const tag = getTag(await tags(), embedModel);
  if (!tag)
    throw new Error(
      `Pull the local embedding model with ollama pull ${embedModel}.`,
    );
  const cacheKey = `${hash}:${tag.digest}`;
  const cached = indexing.get(cacheKey);
  if (cached) return cached;
  const build = (async () => {
    const passages = chunk(workspace.documents);
    const documentVectors = await embedBatches(
      passages.map((passage) => documentInstruction + embeddingText(passage)),
    );
    const questionVectors = await embedBatches(
      workspace.cases.map((item) => instruction + item.question),
    );
    return {
      schema: 1 as const,
      fingerprint: hash,
      model: embedModel,
      modelDigest: tag.digest,
      dimensions: documentVectors[0].length,
      passages: Object.fromEntries(
        passages.map((p, index) => [p.id, documentVectors[index]]),
      ),
      queries: Object.fromEntries(
        workspace.cases.map((item, index) => [item.id, questionVectors[index]]),
      ),
    };
  })();
  indexing.set(cacheKey, build);
  try {
    const index = await build;
    while (indexing.size > 3) indexing.delete(indexing.keys().next().value!);
    return index;
  } catch (error) {
    indexing.delete(cacheKey);
    throw error;
  }
}

export async function askJson(
  system: string,
  input: unknown,
  schema: object,
  tokens: number,
): Promise<unknown> {
  const model = getTag(await tags(), chatModel);
  if (!model)
    throw new Error(`Pull the local chat model with ollama pull ${chatModel}.`);
  const result = (await ollama("/api/chat", {
    model: chatModel,
    stream: false,
    format: schema,
    think: false,
    options: { temperature: 0, num_predict: tokens, num_ctx: 8192 },
    messages: [
      { role: "system", content: system },
      { role: "user", content: JSON.stringify(input) },
    ],
  })) as { message?: { content?: string } };
  try {
    return JSON.parse(result.message?.content ?? "");
  } catch {
    throw new Error("The local model returned invalid JSON.");
  }
}
