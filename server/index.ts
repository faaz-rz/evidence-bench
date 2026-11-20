import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import {
  buildVectorIndex,
  chatModel,
  embedModel,
  getTag,
  tags,
} from "./ollama.ts";
import { research } from "./research.ts";
import type { Ranker } from "../src/types.ts";
import { InputError, readWorkspace } from "../src/workspace.ts";

const port = Number(process.env.PORT ?? 4328);
const rankers = new Set<Ranker>(["term", "bm25", "dense", "hybrid"]);
const maxBytes = 1_600_000;
let activeJobs = 0;

function json(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(value));
}

async function body(req: IncomingMessage) {
  if (req.headers["content-type"]?.split(";")[0] !== "application/json")
    throw new InputError("Use application/json.");
  if (Number(req.headers["content-length"]) > maxBytes)
    throw new InputError("Workspace request is too large.");
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    total += chunk.length;
    if (total > maxBytes)
      throw new InputError("Workspace request is too large.");
    chunks.push(chunk);
  }
  try {
    const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw new Error();
    return data as Record<string, unknown>;
  } catch {
    throw new InputError("Expected a JSON object.");
  }
}

const server = createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  const path = req.url?.split("?")[0];
  if (req.method === "GET" && path === "/api/status") {
    const status = {
      local: true,
      embeddings: false,
      chat: false,
      embedModel,
      chatModel,
    };
    try {
      const available = await tags();
      status.embeddings = Boolean(getTag(available, embedModel));
      status.chat = Boolean(getTag(available, chatModel));
    } catch {
      /* Keep the local workspace available for an offline benchmark. */
    }
    return json(res, 200, status);
  }
  try {
    if (req.method === "GET" && path === "/") {
      const page = await readFile(
        new URL("../dist/index.html", import.meta.url),
      );
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(page);
    }
    if (
      req.method !== "POST" ||
      (path !== "/api/index" && path !== "/api/research")
    )
      return json(res, 404, { error: "Route not found." });
    if (activeJobs >= 2) {
      req.resume();
      return json(res, 429, {
        error: "The local model is busy. Try again when a run finishes.",
      });
    }
    activeJobs++;
    try {
      const data = await body(req);
      const workspace = readWorkspace(data.workspace);
      if (path === "/api/index")
        return json(res, 200, await buildVectorIndex(workspace));
      const ranker = data.ranker as Ranker;
      const k = data.k;
      if (
        !rankers.has(ranker) ||
        typeof k !== "number" ||
        !Number.isInteger(k) ||
        k < 1 ||
        k > 5
      ) {
        throw new InputError(
          "Research requires an available ranker and Top K between 1 and 5.",
        );
      }
      return json(
        res,
        200,
        await research(workspace, data.question as string, ranker, k),
      );
    } finally {
      activeJobs--;
    }
  } catch (error) {
    req.resume();
    if (error instanceof InputError)
      return json(res, 400, { error: error.message });
    console.error(error);
    const message =
      error instanceof Error &&
      /^(Ollama|The local model|Pull|Could not reach)/.test(error.message)
        ? error.message
        : "The workspace could not complete the request. Check the server output.";
    return json(res, 502, { error: message });
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(`Evidence Bench: http://127.0.0.1:${port}`),
);
