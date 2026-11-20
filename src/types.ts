export interface Document {
  id: string;
  title: string;
  sections: { heading: string; text: string }[];
}

export type CaseKind = "direct" | "paraphrase" | "multi-source" | "unsupported";

export interface TestCase {
  id: string;
  kind: CaseKind;
  question: string;
  relevant: string[];
}

export interface Workspace {
  name: string;
  documents: Document[];
  cases: TestCase[];
}

export interface Passage {
  id: string;
  docId: string;
  title: string;
  heading: string;
  text: string;
}

export interface Hit {
  passage: Passage;
  score: number;
  lexicalRank?: number;
  denseRank?: number;
}

export type Ranker = "term" | "bm25" | "dense" | "hybrid";

export interface VectorIndex {
  schema: 1;
  fingerprint: string;
  model: string;
  modelDigest?: string;
  dimensions: number;
  passages: Record<string, number[]>;
  queries: Record<string, number[]>;
}

export interface Citation {
  passage: Passage;
  start: number;
  end: number;
  quote: string;
}

export interface Answer {
  mode: "extractive" | "ollama";
  citations: Citation[];
  model?: string;
}
