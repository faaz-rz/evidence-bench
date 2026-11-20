import { useState } from "react";
import type { FormEvent } from "react";
import { ArrowRight, CircleAlert, Sparkles, Workflow } from "lucide-react";
import { offlineResearch } from "./agent.ts";
import type { ResearchResult } from "./agent.ts";
import { api } from "./api.ts";
import type { ModelStatus } from "./api.ts";
import { needsVectors } from "./retrieval.ts";
import type { Ranker, VectorIndex, Workspace } from "./types.ts";
import { Alert, ExportButton, Quote, RankerSelect, Ranking } from "./ui.tsx";

export function ResearchPanel({
  workspace,
  vectors,
  status,
  initial,
  replays,
}: {
  workspace: Workspace;
  vectors?: VectorIndex;
  status?: ModelStatus;
  initial: string;
  replays: ResearchResult[];
}) {
  const [question, setQuestion] = useState(initial);
  const [mode, setMode] = useState(
    replays.some((run) => run.question === initial) ? "recorded" : "browser",
  );
  const [ranker, setRanker] = useState<Ranker>(vectors ? "hybrid" : "bm25");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ResearchResult>();
  const semantic =
    mode === "local" ? Boolean(status?.embeddings) : Boolean(vectors);
  const options = workspace.cases.filter(
    (item) =>
      mode !== "recorded" ||
      replays.some((run) => run.question === item.question),
  );
  const preset = options.some((item) => item.question === question);
  const replay = replays.find((run) => run.question === question);
  const [recordedResult, setRecordedResult] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    setResult(undefined);
    setRecordedResult(false);
    try {
      if (mode === "recorded") {
        if (!replay) throw new Error("Choose a question with a recorded run.");
        setResult(replay);
        setRecordedResult(true);
        return;
      }
      const data =
        mode === "local"
          ? await api<ResearchResult>("research", {
              workspace,
              question,
              ranker,
              k: 4,
            })
          : offlineResearch(workspace, question, ranker, 4, vectors);
      setResult(data);
    } catch (problem) {
      setError((problem as Error).message);
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <h1>Research agent</h1>
        <p>
          Trace each search and open the exact source behind every returned
          excerpt.
        </p>
      </div>
      <div className="research-layout">
        <div>
          <section className="card ask">
            <h2>
              <Sparkles size={18} /> Ask the workspace
            </h2>
            <form onSubmit={submit}>
              <label className="field">
                Question
                <textarea
                  rows={3}
                  required
                  maxLength={500}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  disabled={pending || mode === "recorded"}
                  placeholder="Ask about the documents…"
                />
              </label>
              {workspace.cases.length > 0 && (
                <label className="field">
                  Load a benchmark question
                  <select
                    aria-label="Load a benchmark question"
                    value={preset ? question : ""}
                    onChange={(event) => setQuestion(event.target.value)}
                    disabled={pending}
                  >
                    <option value="">Choose a preset</option>
                    {options.map((item) => (
                      <option key={item.id} value={item.question}>
                        {item.question}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="ask-controls">
                <label className="field">
                  Research mode
                  <select
                    value={mode}
                    disabled={pending}
                    onChange={(event) => {
                      const next = event.target.value;
                      setMode(next);
                      if (next === "recorded" && !replay)
                        setQuestion(replays[0].question);
                      const supportsVectors =
                        next === "local" ? status?.embeddings : vectors;
                      if (!supportsVectors && needsVectors(ranker))
                        setRanker("bm25");
                    }}
                  >
                    {replays.length > 0 && (
                      <option value="recorded">Replay an Ollama run</option>
                    )}
                    <option value="browser">Browser evidence preview</option>
                    {status?.chat && (
                      <option value="local">Local Ollama agent</option>
                    )}
                  </select>
                </label>
                {mode === "recorded" ? (
                  <p className="field">
                    Retriever <strong>Hybrid</strong>
                  </p>
                ) : (
                  <RankerSelect
                    label="Retriever"
                    value={ranker}
                    setValue={setRanker}
                    semantic={semantic}
                  />
                )}
              </div>
              <p className="hint">
                {mode === "local"
                  ? `${status?.chatModel} plans queries and verifies excerpts on this machine.`
                  : mode === "recorded"
                    ? "Replays an execution captured from the local model."
                    : !preset && needsVectors(ranker)
                      ? "Custom browser questions use BM25. Semantic vectors are bundled for benchmark questions."
                      : "The preview ranks candidate excerpts by word overlap. Use the local agent for model-based verification."}
              </p>
              <button
                type="submit"
                className="button primary"
                disabled={pending || !question.trim()}
              >
                {pending
                  ? "Researching…"
                  : mode === "recorded"
                    ? "Replay trace"
                    : "Search for evidence"}
                <ArrowRight size={16} />
              </button>
            </form>
          </section>
          <Alert message={error} />
          {result && (
            <section className="card evidence">
              <div className="spread wrap">
                <h2>
                  {result.answer.mode === "ollama"
                    ? "Verified excerpts"
                    : "Candidate excerpts"}
                </h2>
                <ExportButton
                  name="evidence-bench-research.json"
                  value={{ ...result, recorded: recordedResult }}
                >
                  Export trace
                </ExportButton>
              </div>
              <p className="hint">{result.question}</p>
              {recordedResult && (
                <p className="hint">
                  Recorded execution from {result.answer.model}.
                </p>
              )}
              {result.answer.citations.length ? (
                result.answer.citations.map((citation, index) => (
                  <Quote
                    key={`${citation.passage.id}:${citation.start}`}
                    citation={citation}
                    index={index}
                  />
                ))
              ) : (
                <p className="empty">
                  <CircleAlert size={17} /> No supporting excerpts were
                  returned.
                </p>
              )}
            </section>
          )}
        </div>
        <section className="card trace">
          <h2>
            <Workflow size={18} /> Execution trace
          </h2>
          {result ? (
            <ol>
              {result.trace.map((step, index) => (
                <li key={index}>
                  <span className="step-number">{index + 1}</span>
                  <div>
                    <strong>{step.stage}</strong>
                    <p>{step.detail}</p>
                    {step.queries && (
                      <ul>
                        {step.queries.map((query) => (
                          <li key={query}>{query}</li>
                        ))}
                      </ul>
                    )}
                    {step.hits && step.hits.length > 0 && (
                      <details>
                        <summary>View ranked documents</summary>
                        <Ranking hits={step.hits} />
                      </details>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="hint" role="status">
              {pending
                ? "The local model may take a minute on its first run."
                : "Run a question to see how evidence was selected."}
            </p>
          )}
        </section>
      </div>
    </>
  );
}
