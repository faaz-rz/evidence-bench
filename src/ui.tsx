import { ArrowDownToLine, Check, CircleAlert, ScanText } from "lucide-react";
import type { Citation, Hit, Ranker } from "./types.ts";

export const rankerLabels: Record<Ranker, string> = {
  term: "Term overlap",
  bm25: "BM25",
  dense: "Dense",
  hybrid: "Hybrid",
};
export const lexicalRankers: Ranker[] = ["term", "bm25"];
export const allRankers: Ranker[] = [...lexicalRankers, "dense", "hybrid"];

export function RankerSelect({
  label,
  value,
  setValue,
  semantic,
}: {
  label: string;
  value: Ranker;
  setValue: (value: Ranker) => void;
  semantic: boolean;
}) {
  return (
    <label className="field">
      {label}
      <select
        aria-label={label}
        value={value}
        onChange={(event) => setValue(event.target.value as Ranker)}
      >
        {(semantic ? allRankers : lexicalRankers).map((ranker) => (
          <option key={ranker} value={ranker}>
            {rankerLabels[ranker]}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ExportButton({
  children,
  name,
  value,
}: {
  children: string;
  name: string;
  value: unknown;
}) {
  function save() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(value, null, 2) + "\n"], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <button type="button" className="button secondary" onClick={save}>
      <ArrowDownToLine size={16} />
      {children}
    </button>
  );
}

export function Alert({ message }: { message: string }) {
  return (
    message && (
      <p className="alert" role="alert">
        <CircleAlert size={17} />
        {message}
      </p>
    )
  );
}

export function Ranking({ hits, gold }: { hits: Hit[]; gold?: string[] }) {
  return hits.length ? (
    <ol className="ranking">
      {hits.map((hit) => (
        <li key={hit.passage.id}>
          <span className="rank-number" />
          <div className="rank-text">
            <strong>{hit.passage.title}</strong>
            <small>{hit.passage.heading}</small>
            <details>
              <summary>Source passage</summary>
              <p>{hit.passage.text}</p>
            </details>
          </div>
          <div className="rank-extra">
            {gold?.includes(hit.passage.docId) && (
              <span className="chip green">
                <Check size={12} /> Relevant
              </span>
            )}
            <span className="rank-score">{hit.score.toFixed(3)}</span>
          </div>
        </li>
      ))}
    </ol>
  ) : (
    <p className="hint">No passages ranked.</p>
  );
}

export function Quote({
  citation,
  index,
}: {
  citation: Citation;
  index: number;
}) {
  return (
    <figure className="quote">
      <figcaption>
        <ScanText size={15} />
        <strong>
          {index + 1}. {citation.passage.title}
        </strong>
        <span>{citation.passage.heading}</span>
      </figcaption>
      <blockquote>{citation.quote}</blockquote>
      <details>
        <summary>View source with highlighted excerpt</summary>
        <p>
          {citation.passage.text.slice(0, citation.start)}
          <mark>{citation.quote}</mark>
          {citation.passage.text.slice(citation.end)}
        </p>
        <small>
          {citation.passage.id} · offsets {citation.start}–{citation.end}
        </small>
      </details>
    </figure>
  );
}
