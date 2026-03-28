import { describe, expect, it } from "vitest";

import { runPromptFootprintBenchmark } from "../src/benchmarks/prompt-footprint.js";

describe("prompt footprint benchmark", () => {
  it("keeps pre-first follow-up prompts materially smaller than a transcript-first baseline", async () => {
    const result = await runPromptFootprintBenchmark();

    expect(result.transcriptFollowUpAverage.current.estimatedTokens).toBeLessThan(
      result.transcriptFollowUpAverage.baseline.estimatedTokens
    );
    expect(result.transcriptFollowUpAverage.estimatedReductionPct).toBeGreaterThanOrEqual(50);
    expect(result.transcriptFollowUpFinalTurn.current.estimatedTokens).toBeLessThan(
      result.transcriptFollowUpFinalTurn.baseline.estimatedTokens
    );
  });

  it("keeps the orchestrator prompt smaller than replaying raw worker transcripts", async () => {
    const result = await runPromptFootprintBenchmark();

    expect(result.multiAgentReducer.current.estimatedTokens).toBeLessThan(
      result.multiAgentReducer.baseline.estimatedTokens
    );
    expect(result.multiAgentReducer.estimatedReductionPct).toBeGreaterThanOrEqual(50);
  });
});
