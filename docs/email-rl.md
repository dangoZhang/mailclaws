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

## Benchmark result

Current deterministic benchmark:

- baseline average reward: `3.17`
- RL average reward: `3.594`
- reward lift: `13.375%`
- baseline coverage: `0.72`
- RL coverage: `0.76`
- coverage lift: `5.556%`
- explainability score: `0 -> 1`

Interpretation:

- the RL packet keeps more high-value email fields than a fixed heuristic order
- the gain is strongest on write-heavy cases with decisions, commitments, and attachments
- explainability improves materially because every retained field now carries a policy reason

Run it locally:

```bash
pnpm benchmark:email-rl
pnpm benchmark:email-rl:json
```

## Current limits

- The built-in policy still trains on seed trajectories, not imported Enron/Avocado traces yet.
- Coverage lift is smaller than reward lift because some scenarios already have strong baseline recall.
- We still need a JSONL importer that converts external corpora into MailClaws trajectory format.

## Next step

The next practical step is to add a corpus importer:

- normalize external threads into MailClaws state/action/reward trajectories
- train the same offline policy on real work-email traces
- re-run the benchmark and replace the seed policy
