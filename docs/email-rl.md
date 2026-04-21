# Offline RL For Work Email

This track upgrades MailClaws around one narrow problem: keep the right email facts for multi-agent collaboration, and explain why those facts were retained.

## Goal

We want the runtime to do four things better:

- read work email with less transcript noise
- write replies from a compact but faithful schema packet
- expose why specific fields were kept
- hand better context to downstream workers and reviewers

## Dataset shortlist

| Dataset | Why it matters | Caveat |
| --- | --- | --- |
| [Enron Email Dataset](https://www.cs.cmu.edu/~enron/) | Public enterprise mail graph for routing, thread recovery, and longitudinal behavior | Old corporate style, no summary labels |
| [Avocado Research Email Collection](https://catalog.ldc.upenn.edu/LDC2015T03) | Modern business mail; strongest corpus here for work-email behavior learning | LDC access required |
| [BC3 Email Corpus](https://www.cs.ubc.ca/labs/lci/bc3/download.html) | Manual thread and summary annotations; useful for retention reward calibration | Too small to train policy alone |
| [W3C Corpus / TREC Enterprise](https://trec.nist.gov/pubs/trec14/papers/ENTERPRISE.OVERVIEW.pdf) | Public long technical threads with decisions, disagreement, and follow-up structure | Not private enterprise mail |
| [EmailSum](https://github.com/ZhangShiyue/EmailSum) | Summary supervision for thread compression evaluation | Summaries only, not governed reply behavior |
| [RADAR Action-Item Dataset](https://www.cs.cmu.edu/~pbennett/action-item-dataset.html) | Action items, owners, and commitments | Specialist signal, not full reply data |

Recommended mix in this repo:

- behavior policy data: Enron + Avocado
- retention reward calibration: BC3 + EmailSum
- actionability calibration: RADAR
- explainability and disagreement: W3C

The code catalog lives in `src/email/datasets.ts`.

## Offline trajectory RL design

The repo now uses a small offline trajectory policy for email schema retention:

1. Convert each email turn into a compact state.
   Fields include mode (`read` / `write` / `explain`), explicit ask, question, deadline, decision, commitment, attachment evidence, constraints, risks, multi-party thread, and open questions.
2. Treat retained schema fields as discrete actions.
   Actions include `ask`, `deadline`, `decision`, `commitment`, `artifact`, `constraint`, `risk`, `question`, `reply_style`, `stakeholder`, and `next_action`.
3. Compute discounted return on logged trajectories.
   The trainer replays offline steps backwards and assigns each retained field a discounted outcome.
4. Apply a conservative penalty before ranking actions.
   This keeps unsupported actions from being overvalued.
5. Build an email packet from the highest-ranked retained fields.
   The packet is compact enough for prompts and includes a short rationale for each retained field.

This is intentionally simple. It borrows the conservative-offline idea from [CQL](https://arxiv.org/abs/2006.04779) and the ranking intuition from [AWR](https://arxiv.org/abs/1910.00177), but the implementation is MailClaws-specific and tabular.

Implementation files:

- `src/email/offline-rl.ts`
- `src/email/schema-policy.ts`
- `src/benchmarks/email-rl.ts`
- `scripts/benchmark-email-rl.mts`

## Runtime wiring

The packet is now injected into orchestrator and worker prompts before the raw body:

- `Current inbound email packet`
- retained schema fields
- short `why` note per retained field

That wiring lives in `src/orchestration/service.ts`.

This keeps the existing raw body and room context, but gives workers a denser, more explainable email-native view first.

## Benchmark suite

The local suite now groups scenarios by benchmark surface:

- `emailsum-thread-summarization`
- `bc3-thread-summary`
- `radar-action-items`
- `mailex-event-extraction`
- `enronsr-reply-alignment`

This keeps testing closer to actual product failure modes:

- summarization
- owner / commitment / next-action extraction
- event trigger and temporal argument retention
- reply alignment for outward email drafting

## Benchmark result

Current deterministic suite result:

- baseline average reward: `2.891`
- RL average reward: `3.657`
- reward lift: `26.502%`
- baseline coverage: `0.675`
- RL coverage: `0.775`
- coverage lift: `14.815%`
- explainability score: `0 -> 1`

Interpretation:

- the RL packet keeps more high-value email fields than a fixed heuristic order
- the gain is strongest on action-item and summary-style cases after tuning commitment and next-action extraction
- explainability improves materially because every retained field now carries a policy reason

Per-benchmark highlights:

- EmailSum: reward lift `350%`, coverage lift `200%`
- RADAR: reward lift `41.729%`, coverage lift `14.286%`
- EnronSR: reward lift `20.326%`, coverage lift `14.286%`

Run it locally:

```bash
pnpm benchmark:email-rl
pnpm benchmark:email-rl:json
```

## Repeated experiment loop

The repo now includes a sweep runner for repeated experiments and parameter search.

It searches over:

- `gamma`
- `supportPenalty`
- `behaviorPenalty`
- `similarityFloor`
- field budgets for `write`, `read`, and `explain`

Current sweep result across 432 experiments:

- best config: `gamma 0.6 | supportPenalty 0.1 | behaviorPenalty 0.04 | similarityFloor 0.45 | fields 4/3/4`
- best reward: `3.548`
- best coverage: `0.75`
- reward lift: `33.302%`
- coverage lift: `20%`

Run it locally:

```bash
pnpm benchmark:email-rl:sweep
pnpm benchmark:email-rl:sweep:json
mailctl benchmark email-rl-sweep
```

Artifacts are written to `output/benchmarks/email-rl-sweep/artifacts/`.

The benchmark scripts now also accept imported trajectory files:

```bash
pnpm tsx scripts/benchmark-email-rl.mts --episodes output/email-trajectories/radar.jsonl --append-seeds --json
pnpm tsx scripts/benchmark-email-rl-sweep.mts --episodes output/email-trajectories/radar.jsonl --append-seeds --output-dir output/benchmarks/email-rl-radar
```

For repeated experiment comparison across training variants:

```bash
pnpm tsx scripts/benchmark-email-rl-compare.mts --episodes output/email-trajectories/radar.jsonl --benchmark-ids radar-action-items,enronsr-reply-alignment --json
```

That comparison report ranks:

- `seed-default`
- `seed-tuned`
- `imported-default`
- `seed-plus-imported-default`
- `imported-tuned`
- `seed-plus-imported-tuned`

and writes side-by-side artifacts under `output/benchmarks/email-rl-compare/artifacts/`.

If you want stable, reusable experiment recipes, the compare script also accepts a manifest:

```bash
pnpm tsx scripts/benchmark-email-rl-compare.mts --config experiments/email-rl-compare.json --json
```

Example manifest:

```json
{
  "benchmarkIds": ["radar-action-items", "enronsr-reply-alignment"],
  "anchorVariantId": "seed-default",
  "outputDir": "output/benchmarks/email-rl-compare-manifest",
  "variants": [
    {
      "variantId": "seed-default",
      "title": "Seed default"
    },
    {
      "variantId": "imported-tuned",
      "title": "Imported tuned",
      "episodes": "../data/radar.jsonl",
      "preset": "tuned",
      "appendSeedEpisodes": true
    }
  ]
}
```

Relative paths inside the manifest are resolved from the manifest directory.

## Trajectory import

The repo now includes a corpus importer that turns external JSON or JSONL records into MailClaws trajectory episodes.

Supported profiles:

- `generic`
- `emailsum`
- `bc3`
- `radar-action-items`
- `mailex`
- `enronsr-reply-alignment`

Example generic record:

```json
{
  "episodeId": "pricing-reply-001",
  "mode": "write",
  "from": "buyer@example.com",
  "to": ["frontdesk@mailclaws.test"],
  "subject": "Need pricing reply by Friday",
  "body": "Please send the pricing reply by Friday and use the attached quote.",
  "attachments": [
    {
      "filename": "quote.pdf",
      "summaryText": "Draft quote for the pilot package."
    }
  ],
  "annotations": {
    "actions": {
      "ask": ["Send the pricing reply"],
      "deadline": ["Friday"],
      "artifact": ["quote.pdf"]
    }
  }
}
```

Import it:

```bash
pnpm tsx scripts/import-email-trajectories.mts \
  --input data/email-records.jsonl \
  --output output/email-trajectories/imported.jsonl \
  --profile generic
```

The importer writes `EmailTrajectoryEpisode` JSONL that can be fed back into the benchmark and sweep scripts.

## Current limits

- The built-in policy still defaults to seed trajectories unless you pass imported episodes explicitly.
- Event-extraction style cases are now stable, but not yet clearly above baseline.
- The importer is profile-based and heuristic. Full Enron or Avocado normalization still needs dataset-specific adapters.

## Next step

The next practical step is to replace the profile heuristics with dataset-native adapters:

- normalize full Enron or Avocado thread exports into the importer schema
- add richer reward shaping from summary, action-item, and reply-quality labels
- compare imported-only training against `seed + imported` training before changing runtime defaults
