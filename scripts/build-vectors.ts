import { readFile, writeFile } from "node:fs/promises";
import { buildVectorIndex } from "../server/ollama.ts";
import { readWorkspace } from "../src/workspace.ts";

const fixture = new URL("../fixtures/workspace.json", import.meta.url);
const workspace = readWorkspace(JSON.parse(await readFile(fixture, "utf8")));
const vectors = await buildVectorIndex(workspace);
await writeFile(
  new URL("../fixtures/vectors.json", import.meta.url),
  JSON.stringify(vectors) + "\n",
);
console.log(
  `Generated ${vectors.dimensions}-dimension vectors for ${Object.keys(vectors.passages).length} passages and ${Object.keys(vectors.queries).length} questions.`,
);
