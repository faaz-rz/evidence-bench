# Evidence Bench

When a document assistant gives the wrong answer, the first question is whether it found the right source. Evidence Bench gives you a way to check. Run the same labelled questions through different search methods, open the cases that got worse, then follow a research agent from its first search to the exact passages it returns.

[Open the live demo](https://faaz-rz.github.io/evidence-bench/) · [Read the design notes](docs/design.md)

![Evidence Bench comparing BM25 and dense search, with scores for individual questions](docs/benchmark.png)

## Try two cases

1. In **Benchmark**, leave the default comparison on BM25 versus Dense with **Top K** set to **3**. Select **Regressed** and open “What happens to collaboration if our card is declined?” BM25 ranks the expected billing document second. Dense search leaves it out of the top three, even though its average score is higher.
2. Open **Research agent**, select **Replay an Ollama run**, and replay the outage question. The trace shows where the agent found the one-hour support response target and the thirty-minute incident update cadence. Expand a citation to see the quote in context. Replay the extra-storage pricing question to see the agent try another search and abstain.

The hosted app computes benchmarks in your browser and replays three recorded model runs. **Browser evidence preview** also accepts new questions and ranks candidate excerpts by word overlap. To run new questions through the model itself, use the local setup below.

## Run the agent locally

Use Node.js 24 or later and a running [Ollama](https://ollama.com/) service.

```sh
ollama pull nomic-embed-text
ollama pull qwen3.5:4b
npm ci
npm run build
npm start
```

Open [the local workspace](http://127.0.0.1:4328) and choose **Local Ollama agent** under **Research agent**. The model proposes search phrases and selects excerpt IDs from the passages the retriever found. The application checks those IDs and the quote offsets before displaying the original text. This guarantees that a quote came from the cited passage. Judging whether the quote fully answers the question still requires reviewing the evidence.

To try your own documents, go to **Corpus**, export the sample workspace JSON, and use it as the template for your documents and expected sources. Import the edited file and select **Build semantic index** in the local app. The server listens on loopback, and imported workspaces are held in browser memory for the session.

## What the benchmark measures

The bundled dataset contains 18 fictional handbook documents and 36 questions. Thirty questions have labelled sources and contribute to the averages. The six unsupported probes have no expected source and are tracked separately.

| Search method | nDCG@3 | Recall@3 | MRR@3 |
| --- | ---: | ---: | ---: |
| BM25 keyword search | 0.639 | 0.667 | 0.633 |
| Dense embedding search | 0.930 | 0.967 | 0.917 |
| Hybrid via reciprocal rank fusion | 0.843 | 0.933 | 0.811 |

On this fixture, dense search improves 12 questions, ties 17, and regresses on one against BM25. Recall measures how many expected sources made the cut. nDCG rewards finding them earlier, and MRR rewards a higher rank for the first relevant source. These are retrieval results on the sample handbook.

Run the same comparison from the command line, export the rankings, and fail the run if it misses the configured thresholds.

```sh
npm ci
npm run benchmark -- --gate fixtures/gate.json --out run.json
```

The export records the corpus fingerprint, embedding model digest, cutoff, and per-question results. [See the retrieval and agent design](docs/design.md) for the scoring and failure cases.

## Verification

```sh
npm test
npx playwright install chromium
npm run test:browser
npm run test:agent
```

The agent smoke test requires the local Ollama models above. To regenerate the hosted recordings after it passes, use `npm run test:agent -- --record`.

Built as an AI-assisted portfolio project.
