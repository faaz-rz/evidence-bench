import { useEffect, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  ChartNoAxesColumn,
  CircleHelp,
  Equal,
  Play,
} from "lucide-react";
import { compare } from "./benchmark.ts";
import type { Benchmark, CaseResult } from "./benchmark.ts";
import type { Ranker, VectorIndex, Workspace } from "./types.ts";
import {
  Alert,
  ExportButton,
  RankerSelect,
  Ranking,
  rankerLabels,
} from "./ui.tsx";

const specifications = [
  {
    key: "ndcg",
    label: "nDCG",
    help: "Rewards relevant sources near the top.",
  },
  {
    key: "recall",
    label: "Recall",
    help: "Share of expected sources retrieved.",
  },
  {
    key: "reciprocalRank",
    label: "MRR",
    help: "Average inverse rank of the first relevant source.",
  },
] as const;
const format = (number: number) => number.toFixed(3);
const deltaValue = (number: number) =>
  number > 1e-9 ? "improved" : number < -1e-9 ? "regressed" : "tied";
const kinds = {
  direct: "Direct",
  paraphrase: "Paraphrase",
  "multi-source": "Multi-source",
  unsupported: "Unsupported",
};

function Metrics({ result }: { result: Benchmark }) {
  return (
    <div className="metrics">
      {specifications.map(({ key, label, help }) => {
        const a = result.averages.baseline[key];
        const b = result.averages.candidate[key];
        const delta = b - a;
        const summary = deltaValue(delta);
        return (
          <section className="card metric" key={key} aria-label={label}>
            <div className="metric-title">
              <h2>
                {label}@{result.k}
              </h2>
              <span className={"chip " + summary}>
                {delta > 1e-9 ? "+" : ""}
                {format(Math.abs(delta) < 1e-9 ? 0 : delta)}
              </span>
            </div>
            <strong>{format(b)}</strong>
            <div
              className="bar-row"
              aria-label={`${rankerLabels[result.baseline]} ${format(a)}`}
            >
              <span>{rankerLabels[result.baseline]}</span>
              <div>
                <i style={{ width: `${a * 100}%` }} />
              </div>
              <span>{format(a)}</span>
            </div>
            <div
              className="bar-row candidate"
              aria-label={`${rankerLabels[result.candidate]} ${format(b)}`}
            >
              <span>{rankerLabels[result.candidate]}</span>
              <div>
                <i style={{ width: `${b * 100}%` }} />
              </div>
              <span>{format(b)}</span>
            </div>
            <p>{help}</p>
          </section>
        );
      })}
    </div>
  );
}

function QueryReport({
  row,
  run,
  onAsk,
}: {
  row: CaseResult;
  run: Benchmark;
  onAsk: () => void;
}) {
  return (
    <section className="card comparison">
      <div className="spread wrap">
        <div>
          <p className="eyebrow">Query inspection</p>
          <h2>{row.item.question}</h2>
        </div>
        <button className="button secondary" onClick={onAsk}>
          Open in Research <ArrowUpRight size={15} />
        </button>
      </div>
      <p className="hint">
        {row.item.relevant.length
          ? `Expected source IDs: ${row.item.relevant.join(", ")}`
          : "This probe has no labelled answer source. It is excluded from retrieval metrics."}
      </p>
      <div className="columns">
        <section>
          <h3>{rankerLabels[run.baseline]} ranking</h3>
          <Ranking hits={row.baseline.hits} gold={row.item.relevant} />
        </section>
        <section>
          <h3>{rankerLabels[run.candidate]} ranking</h3>
          <Ranking hits={row.candidate.hits} gold={row.item.relevant} />
        </section>
      </div>
    </section>
  );
}

type Filter = "all" | "improved" | "regressed" | "unsupported";
const pageSize = 8;

export function BenchPanel({
  workspace,
  vectors,
  onAsk,
}: {
  workspace: Workspace;
  vectors?: VectorIndex;
  onAsk: (question: string) => void;
}) {
  const [baseline, setBaseline] = useState<Ranker>(vectors ? "bm25" : "term");
  const [candidate, setCandidate] = useState<Ranker>(
    vectors ? "dense" : "bm25",
  );
  const [k, setK] = useState(3);
  const [result, setResult] = useState<Benchmark>();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState("");
  const [page, setPage] = useState(0);

  async function run(a: Ranker, b: Ranker, top: number) {
    setPending(true);
    setError("");
    try {
      setResult(await compare(workspace, vectors, top, a, b));
      setSelected("");
      setPage(0);
      setFilter("all");
    } catch (problem) {
      setError((problem as Error).message);
    } finally {
      setPending(false);
    }
  }
  useEffect(() => {
    void run(baseline, candidate, k);
  }, []);

  const filtered =
    result?.cases.filter(
      ({ delta }) =>
        filter === "all" ||
        (delta === null
          ? filter === "unsupported"
          : deltaValue(delta) === filter),
    ) ?? [];
  const visible = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const row = result?.cases.find((record) => record.item.id === selected);
  const filters: {
    id: Filter;
    label: string;
    value: number;
    icon?: typeof Activity;
  }[] = [
    { id: "all", label: "All queries", value: result?.cases.length ?? 0 },
    {
      id: "improved",
      label: "Improved",
      value: result?.improved ?? 0,
      icon: ArrowUpRight,
    },
    {
      id: "regressed",
      label: "Regressed",
      value: result?.regressed ?? 0,
      icon: ArrowDownRight,
    },
    {
      id: "unsupported",
      label: "Unsupported",
      value: result?.unsupported ?? 0,
      icon: CircleHelp,
    },
  ];

  return (
    <>
      <div className="page-heading spread wrap">
        <div>
          <h1>Retrieval benchmark</h1>
          <p>
            Compare search pipelines on labelled questions and inspect where
            rankings regress.
          </p>
        </div>
        {result && (
          <ExportButton name="evidence-bench-run.json" value={result}>
            Export run
          </ExportButton>
        )}
      </div>
      <section className="card configuration">
        <div className="config-description">
          <h2>
            <ChartNoAxesColumn size={18} /> Run configuration
          </h2>
          <p>
            {workspace.cases.length} cases · {workspace.documents.length}{" "}
            documents{vectors && ` · ${vectors.model}`}
          </p>
        </div>
        <div className="config-fields">
          <RankerSelect
            label="Baseline"
            value={baseline}
            setValue={setBaseline}
            semantic={Boolean(vectors)}
          />
          <RankerSelect
            label="Candidate"
            value={candidate}
            setValue={setCandidate}
            semantic={Boolean(vectors)}
          />
          <label className="field">
            Top K
            <select
              value={k}
              onChange={(event) => setK(Number(event.target.value))}
            >
              {[1, 3, 5, 10].map((number) => (
                <option key={number} value={number}>
                  {number}
                </option>
              ))}
            </select>
          </label>
          <button
            className="button primary"
            disabled={pending || baseline === candidate}
            onClick={() => void run(baseline, candidate, k)}
          >
            <Play size={15} />
            {pending ? "Running…" : "Run benchmark"}
          </button>
        </div>
        {baseline === candidate && (
          <p className="hint">Choose different pipelines to compare them.</p>
        )}
      </section>
      <Alert message={error} />
      {result && (
        <>
          {result.comparable > 0 ? (
            <Metrics result={result} />
          ) : (
            <p className="card empty">
              Add a labelled case to calculate metrics.
            </p>
          )}
          <section className="card query-table">
            <div className="table-header spread wrap">
              <div>
                <h2>Query results</h2>
                <p>
                  {result.comparable} scored · {result.tied} tied ·{" "}
                  {result.unsupported} unsupported
                </p>
              </div>
              <div className="filters" aria-label="Filter query results">
                {filters.map(({ id, label, value, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={filter === id}
                    onClick={() => {
                      setFilter(id);
                      setPage(0);
                      setSelected("");
                    }}
                  >
                    {Icon && <Icon size={14} />} {label} <small>{value}</small>
                  </button>
                ))}
              </div>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Question</th>
                    <th scope="col">Case type</th>
                    <th scope="col">{rankerLabels[result.baseline]}</th>
                    <th scope="col">{rankerLabels[result.candidate]}</th>
                    <th scope="col">Δ nDCG</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(({ item, baseline: a, candidate: b, delta }) => (
                    <tr
                      key={item.id}
                      className={selected === item.id ? "selected" : ""}
                    >
                      <th scope="row">
                        <button
                          aria-expanded={selected === item.id}
                          className="table-link"
                          onClick={() =>
                            setSelected(selected === item.id ? "" : item.id)
                          }
                        >
                          {item.question}
                        </button>
                      </th>
                      <td>
                        <span className="chip neutral">{kinds[item.kind]}</span>
                      </td>
                      <td>{a.metrics ? format(a.metrics.ndcg) : "—"}</td>
                      <td>{b.metrics ? format(b.metrics.ndcg) : "—"}</td>
                      <td>
                        {delta === null ? (
                          "—"
                        ) : (
                          <span className={"number " + deltaValue(delta)}>
                            {delta > 1e-9 ? "+" : ""}
                            {format(Math.abs(delta) < 1e-9 ? 0 : delta)}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {visible.length === 0 && (
                <p className="empty">No queries in this view.</p>
              )}
            </div>
            {row && (
              <QueryReport
                row={row}
                run={result}
                onAsk={() => onAsk(row.item.question)}
              />
            )}
            <div className="pagination spread">
              <span>
                {filtered.length
                  ? `${page * pageSize + 1}–${page * pageSize + visible.length} of ${filtered.length}`
                  : "0 results"}
              </span>
              <div>
                <button
                  className="button secondary small"
                  disabled={page === 0}
                  onClick={() => {
                    setPage(page - 1);
                    setSelected("");
                  }}
                >
                  Previous
                </button>
                <button
                  className="button secondary small"
                  disabled={(page + 1) * pageSize >= filtered.length}
                  onClick={() => {
                    setPage(page + 1);
                    setSelected("");
                  }}
                >
                  Next
                </button>
              </div>
            </div>
          </section>
          <p className="run-id">
            <Equal size={14} /> Corpus and case fingerprint{" "}
            <code>{result.fingerprint.slice(0, 16)}</code>
          </p>
        </>
      )}
    </>
  );
}
