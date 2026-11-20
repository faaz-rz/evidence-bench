import { useEffect, useState } from "react";
import {
  ChartNoAxesColumn,
  Database,
  FlaskConical,
  Github,
  Orbit,
  Workflow,
} from "lucide-react";
import { createRoot } from "react-dom/client";
import { api } from "./api.ts";
import type { ModelStatus } from "./api.ts";
import { BenchPanel } from "./bench-panel.tsx";
import { CorpusPanel } from "./corpus-panel.tsx";
import { sample, sampleVectors } from "./fixture.ts";
import { recorded } from "./replays.ts";
import { ResearchPanel } from "./research-panel.tsx";
import type { VectorIndex, Workspace } from "./types.ts";
import "./style.css";

declare const __ENABLE_LOCAL_API__: boolean;

const pages = [
  { id: "benchmark", text: "Benchmark", icon: ChartNoAxesColumn },
  { id: "research", text: "Research agent", icon: Workflow },
  { id: "corpus", text: "Corpus", icon: Database },
] as const;
type Page = (typeof pages)[number]["id"];

function App() {
  const [page, setPage] = useState<Page>("benchmark");
  const [{ workspace, vectors, version }, setActive] = useState<{
    workspace: Workspace;
    vectors?: VectorIndex;
    version: number;
  }>({ workspace: sample, vectors: sampleVectors, version: 0 });
  const [initial, setInitial] = useState(
    sample.cases.find((item) => item.id === "m01")?.question ?? "",
  );
  const [status, setStatus] = useState<ModelStatus>();
  const isSample = workspace === sample;

  useEffect(() => {
    if (
      !__ENABLE_LOCAL_API__ ||
      !["127.0.0.1", "localhost"].includes(location.hostname)
    )
      return;
    void api<ModelStatus>("status")
      .then(setStatus)
      .catch(() => undefined);
  }, []);

  function replace(data: Workspace, index?: VectorIndex) {
    setActive((current) => ({
      workspace: data,
      vectors: index,
      version: current.version + 1,
    }));
    setInitial(data.cases[0]?.question ?? "");
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">
            <Orbit size={25} />
          </span>
          <span>Evidence Bench</span>
        </div>
        <nav aria-label="Workspace navigation">
          {pages.map(({ id, text, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-current={page === id ? "page" : undefined}
              onClick={() => {
                setPage(id);
                window.scrollTo(0, 0);
              }}
            >
              <Icon size={18} />
              {text}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span>
            <i /> {status?.chat ? "Local model available" : "Browser workspace"}
          </span>
          <a
            href="https://github.com/faaz-rz/evidence-bench"
            target="_blank"
            rel="noreferrer"
          >
            <Github size={17} /> Source on GitHub
          </a>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span>
            <FlaskConical size={16} />
            {workspace.name}
          </span>
          <span className="workspace-tag">
            {isSample ? "Synthetic dataset" : "Imported workspace"}
          </span>
        </header>
        <div className="content">
          {page === "benchmark" && (
            <BenchPanel
              key={version}
              workspace={workspace}
              vectors={vectors}
              onAsk={(question) => {
                setInitial(question);
                setPage("research");
                window.scrollTo(0, 0);
              }}
            />
          )}
          {page === "research" && (
            <ResearchPanel
              key={version}
              workspace={workspace}
              vectors={vectors}
              status={status}
              initial={initial}
              replays={isSample ? recorded : []}
            />
          )}
          {page === "corpus" && (
            <CorpusPanel
              workspace={workspace}
              vectors={vectors}
              status={status}
              onImport={(data) => replace(data)}
              onIndex={(index) => {
                setActive((current) =>
                  current.workspace === workspace
                    ? {
                        ...current,
                        vectors: index,
                        version: current.version + 1,
                      }
                    : current,
                );
              }}
              onReset={() => replace(sample, sampleVectors)}
            />
          )}
        </div>
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
