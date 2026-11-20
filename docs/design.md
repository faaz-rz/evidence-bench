# Design and evaluation

## Data flow

```text
workspace → bounded passages → keyword and vector indexes
  question → local planner → up to three searches → interleaved passages
    exact excerpts → local verifier → validated citation IDs → answer trace
                          └ insufficient evidence → one fallback search
```

The research agent keeps the original question and adds up to two model-generated search phrases. A one-pass fallback is available when verification finds insufficient evidence. The service can make at most one planner call and two verifier calls for a question. The model can only propose search text and select excerpt IDs. The agent returns exact slices of retrieved passages. Each citation contains the passage ID and UTF-16 offsets for the quote. A schema allowlist and server-side validation reject unknown or duplicate identifiers.

The hosted workspace can replay three captured Ollama runs, with model and embedding digests in the replay fixture. Its interactive preview selects candidate quotes using token overlap. The local verifier checks whether the excerpts address the question and can abstain. Model relevance judgments can be wrong even when the source offsets are exact. The reference corpus contains fictional policies for a collaboration product. These results describe the bundled fixture.

## Retrieval and evaluation

- **Term overlap** counts distinct matching tokens. **BM25** weights terms by corpus frequency and normalizes by passage length. Tokenization is Unicode-aware with a small English stop-word set.
- **Dense** ranks cosine similarity using Nomic Embed Text from Ollama. The demo bundles vectors produced from the fixture, and the CLI records the model digest. Ollama regenerates vectors locally for imported corpora or arbitrary questions.
- **Hybrid** uses reciprocal rank fusion with constant 60 and a 20-document candidate limit per channel. Each channel retains its best passage per document. The fused result carries both channel ranks.
- **Recall@K** counts the fraction of labelled sources retrieved. **nDCG@K** discounts correct sources by rank. **MRR@K** uses the position of the first correct source. The benchmark computes macro averages over the labelled questions. Unsupported probes lack a relevance target and are excluded from those averages.
- The gate checks the scored-case count, candidate nDCG and recall, and the number of regressions against the current baseline. It is a retrieval gate. The separate agent smoke check exercises direct evidence, multi-source evidence, and abstention with installed model weights.

See [BEIR](https://arxiv.org/abs/2104.08663) for retrieval evaluation context and [Cormack et al.](https://cormack.uwaterloo.ca/cormack/cormacksigir09-rrf.pdf) for reciprocal rank fusion.

## Five-minute walkthrough

1. Inspect the labelled result for the declined-card question in the Dense comparison. Open the ranked passages and compare the expected billing document with the documents that outrank it.
2. Switch to Hybrid and rerun. The trade-off is visible in the aggregate metrics and individual rows.
3. Open the agent for the multi-source outage question. Compare the one-hour ticket response with the thirty-minute incident update cadence. Open the highlighted quotes to locate each fact in the source.
4. Ask about the cost of an extra gigabyte of storage. The handbook contains storage references and omits the pricing detail. The local agent can abstain.
5. Export the benchmark and show the fingerprint, model digest, and exact ranker settings. Tighten the gate beyond the observed score to see a nonzero exit status.

A larger deployment would need persistence, authenticated workspaces, indexed vector search, and a broader independently labelled benchmark. The local service deliberately bounds input size, retrieval depth, model calls, and concurrent execution. The UI displays retrieved text as text.
