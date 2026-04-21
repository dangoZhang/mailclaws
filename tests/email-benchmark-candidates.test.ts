import { describe, expect, it } from "vitest";

import {
  getEmailBenchmarkCandidate,
  listEmailBenchmarkCandidates,
  recommendEmailBenchmarkCandidates,
  recommendEmailBenchmarkPlan
} from "../src/email/benchmark-candidates.js";

describe("email benchmark candidates", () => {
  it("lists implemented and planned benchmark candidates", () => {
    const candidates = listEmailBenchmarkCandidates();

    expect(candidates.length).toBeGreaterThanOrEqual(8);
    expect(candidates.some((candidate) => candidate.status === "implemented")).toBe(true);
    expect(candidates.some((candidate) => candidate.candidateId === "aeslc-subject-generation")).toBe(true);
  });

  it("recommends benchmark candidates by operation surface", () => {
    const writeCandidates = recommendEmailBenchmarkCandidates("write");

    expect(writeCandidates[0]?.status).toBe("implemented");
    expect(writeCandidates.map((candidate) => candidate.candidateId)).toContain("enronsr-reply-alignment");
    expect(writeCandidates.map((candidate) => candidate.candidateId)).toContain("aeslc-subject-generation");
  });

  it("returns the benchmark planning mix for read write explain optimization", () => {
    const plan = recommendEmailBenchmarkPlan();

    expect(plan.write).toEqual(["enronsr-reply-alignment", "aeslc-subject-generation"]);
    expect(plan.read).toContain("cerec-entity-resolution");
    expect(plan.behaviorPolicy).toEqual(["avocado-behavior-trajectories"]);
    expect(getEmailBenchmarkCandidate(plan.explain[0] ?? "")?.operations).toContain("explain");
  });
});
