# Prompt Footprint

MailClaws's current agent behavior is deliberately **pre-first**:

- load the latest inbound mail
- load the latest persisted room Pre snapshot
- pull older evidence only by ref
- avoid replaying a growing full transcript by default

This page documents the repository-local benchmark that estimates how much prompt volume that architecture removes relative to a conservative session-first baseline.

## What The Benchmark Measures

Run:

```bash
mailctl benchmark prompt-footprint
mailctl --json benchmark prompt-footprint
pnpm benchmark:prompt-footprint
pnpm benchmark:prompt-footprint:json
```

The benchmark builds real rooms in a temporary SQLite state dir, runs the normal orchestration path, captures the actual `inputText` sent into the executor, and compares that prompt against a baseline assembled from the same room data.

The current script reports:

1. `Transcript follow-up average`
2. `Transcript follow-up final turn`
3. `Multi-agent reducer handoff`

## Estimate Method

MailClaws does **not** claim these are provider-billed tokens. The benchmark uses:

```text
estimated_tokens = ceil(characters / 4)
```

That makes the output stable across models and easy to rerun inside CI or local release checks.

## Current Repository Measurement

Measured on `2026-03-28`:

- Long-thread follow-ups: `755` estimated tokens vs `2006` for transcript-first, `62.3%` lower on average.
- Turn-6 follow-up: `752` estimated tokens vs `2868`, `73.8%` lower.
- 5-worker reducer handoff: `750` estimated tokens vs `3444`, `78.2%` lower.

## How To Read The Result

- The first two numbers approximate the savings from replacing "load the whole room transcript again" with "load latest inbound + latest Pre snapshot".
- The multi-agent number approximates the savings from reducer summaries instead of replaying every worker's prompt and raw output back into the front orchestrator.

In practice, this means MailClaws's prompt growth should stay much flatter than a session-first OpenClaw-style baseline once a room becomes long or once multiple workers collaborate in parallel.

## Baselines Used

### Transcript-first baseline

For the long-thread scenario, the baseline appends:

- the current prompt prefix
- a synthetic full session transcript
- every prior user turn
- every prior assistant turn

This intentionally models the common "just stuff the whole conversation back in" behavior.

### Raw worker transcript baseline

For the multi-agent scenario, the baseline appends:

- the current orchestrator prefix
- every worker prompt
- every worker raw response

This models a naive orchestration layer that treats worker transcripts as front-orchestrator context instead of reducing them to summaries and draft snippets.

## Why This Matters

Smaller orchestrator prompts improve three things at once:

- lower average token cost
- lower latency variance on long rooms
- lower risk of transcript pollution across rooms or across worker lanes

That is the architectural reason MailClaws keeps durable **Pre** and treats transcript/scratch/tool traces as short-lived execution state instead of long-lived memory.

## Reproduce In Tests

The benchmark has a small regression test:

```bash
pnpm vitest run tests/prompt-footprint-benchmark.test.ts
```

It currently asserts that:

- follow-up turns stay materially smaller than transcript-first
- reducer prompts stay materially smaller than replaying raw worker transcripts

## Source

- Benchmark logic: `src/benchmarks/prompt-footprint.ts`
- CLI wrapper: `scripts/benchmark-prompt-footprint.mts`
- Regression test: `tests/prompt-footprint-benchmark.test.ts`
