import { useRef, useState } from "react";
import { Database, FileJson, FileText, Search, Upload } from "lucide-react";
import { api } from "./api.ts";
import type { ModelStatus } from "./api.ts";
import { Alert, ExportButton } from "./ui.tsx";
import type { VectorIndex, Workspace } from "./types.ts";
import { chunk, readWorkspace } from "./workspace.ts";

export function CorpusPanel({
  workspace,
  vectors,
  status,
  onImport,
  onIndex,
  onReset,
}: {
  workspace: Workspace;
  vectors?: VectorIndex;
  status?: ModelStatus;
  onImport: (workspace: Workspace) => void;
  onIndex: (vectors: VectorIndex) => void;
  onReset: () => void;
}) {
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const matches = workspace.documents.filter((doc) =>
    (doc.id + " " + doc.title + " " + doc.sections.map((s) => s.text).join(" "))
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  async function upload(file?: File) {
    if (!file) return;
    setPending(true);
    setError("");
    try {
      if (file.size > 1_000_000)
        throw new Error("Choose a workspace JSON file under 1 MB.");
      const bundle = readWorkspace(JSON.parse(await file.text()));
      chunk(bundle.documents);
      onImport(bundle);
      setQuery("");
    } catch (problem) {
      setError((problem as Error).message);
    } finally {
      setPending(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  async function build() {
    setPending(true);
    setError("");
    try {
      onIndex(await api<VectorIndex>("index", { workspace }));
    } catch (problem) {
      setError((problem as Error).message);
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <div className="page-heading spread wrap">
        <div>
          <h1>Workspace corpus</h1>
          <p>
            Inspect source documents and relevance labels. Import a JSON
            workspace to test your own material.
          </p>
        </div>
        <button
          className="button secondary"
          onClick={onReset}
          disabled={pending}
        >
          Load sample workspace
        </button>
      </div>
      <section className="card corpus-controls">
        <div>
          <h2>
            <Database size={18} />
            {workspace.name}
          </h2>
          <p>
            {workspace.documents.length} documents ·{" "}
            {chunk(workspace.documents).length} passages ·{" "}
            {workspace.cases.length} test cases
          </p>
        </div>
        <div className="actions">
          <input
            ref={fileRef}
            type="file"
            className="sr-only"
            aria-label="Workspace JSON"
            accept=".json,application/json"
            onChange={(e) => void upload(e.target.files?.[0])}
          />
          <button
            className="button primary"
            disabled={pending}
            onClick={() => fileRef.current?.click()}
          >
            <Upload size={16} /> Import workspace
          </button>
          <ExportButton name="evidence-bench-workspace.json" value={workspace}>
            Export workspace
          </ExportButton>
          {status?.embeddings && (
            <button
              className="button secondary"
              disabled={pending}
              onClick={() => void build()}
            >
              {pending ? "Working…" : "Build semantic index"}
            </button>
          )}
        </div>
        <p className="hint">
          <FileJson size={15} />{" "}
          {vectors
            ? `Semantic index ready · ${vectors.model} · ${vectors.dimensions} dimensions`
            : "Keyword ranking is ready. Use local Ollama to build a semantic index."}
        </p>
      </section>
      <Alert message={error} />
      <section className="card documents">
        <div className="spread wrap">
          <h2>Documents</h2>
          <label className="search">
            <Search size={16} />
            <input
              type="search"
              aria-label="Search documents"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search documents…"
            />
          </label>
        </div>
        <ul>
          {matches.map((doc) => (
            <li key={doc.id}>
              <details>
                <summary>
                  <FileText size={16} />
                  <strong>{doc.title}</strong>
                  <code>{doc.id}</code>
                </summary>
                {doc.sections.map((section, index) => (
                  <div key={index}>
                    <h3>{section.heading}</h3>
                    <p>{section.text}</p>
                  </div>
                ))}
              </details>
            </li>
          ))}
        </ul>
        {!matches.length && <p className="empty">No matching documents.</p>}
      </section>
    </>
  );
}
