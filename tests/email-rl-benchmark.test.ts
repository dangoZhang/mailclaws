import { describe, expect, it } from "vitest";

import { runEmailRlBenchmark } from "../src/benchmarks/email-rl.js";

describe("email offline rl benchmark", () => {
  it("improves retained-context reward and coverage over a fixed heuristic baseline", async () => {
    const result = await runEmailRlBenchmark();

    expect(result.rlPolicy.averageReward).toBeGreaterThan(result.baseline.averageReward);
    expect(result.rlPolicy.coverage).toBeGreaterThan(result.baseline.coverage);
    expect(result.rewardLiftPct).toBeGreaterThan(10);
    expect(result.coverageLiftPct).toBeGreaterThan(5);
  });
});
