import fs from "node:fs";
import path from "node:path";

import { runEmailRlBenchmark, type EmailRlBenchmarkResult, renderEmailRlBenchmarkMarkdown } from "./email-rl.js";
import type { EmailTrajectoryEpisode } from "../email/offline-rl.js";

export interface EmailRlSweepCandidateConfig {
  gamma: number;
  supportPenalty: number;
  behaviorPenalty: number;
  similarityFloor: number;
  maxWriteFields: number;
  maxReadFields: number;
  maxExplainFields: number;
}

export interface EmailRlSweepCandidateResult {
  candidateId: string;
  config: EmailRlSweepCandidateConfig;
  objectiveScore: number;
  summary: {
    reward: number;
    coverage: number;
    rewardLiftPct: number;
    coverageLiftPct: number;
    benchmarks: EmailRlBenchmarkResult["benchmarks"];
  };
}

export interface RunEmailRlSweepInput {
  generatedAt?: string;
  benchmarkIds?: string[];
  trainingEpisodes?: EmailTrajectoryEpisode[];
  appendSeedEpisodes?: boolean;
  maxCandidates?: number;
  gammaValues?: number[];
  supportPenaltyValues?: number[];
  behaviorPenaltyValues?: number[];
  similarityFloorValues?: number[];
  maxWriteFieldsValues?: number[];
  maxReadFieldsValues?: number[];
  maxExplainFieldsValues?: number[];
}

export interface EmailRlSweepResult {
  generatedAt: string;
  benchmarkIds: string[];
  experimentCount: number;
  objectiveFormula: string;
  bestCandidate: EmailRlSweepCandidateResult;
  topCandidates: EmailRlSweepCandidateResult[];
}

export interface EmailRlSweepArtifactResult extends EmailRlSweepResult {
  outputDir: string;
  artifactsDir: string;
  files: Array<{
    path: string;
    bytes: number;
  }>;
}

const defaultGeneratedAt = "2026-04-21T11:00:00.000Z";

export async function runEmailRlSweep(input: RunEmailRlSweepInput = {}): Promise<EmailRlSweepResult> {
  const generatedAt = input.generatedAt ?? defaultGeneratedAt;
  const maxCandidates = input.maxCandidates ?? 10;
  const candidates = enumerateCandidateConfigs(input);
  const results: EmailRlSweepCandidateResult[] = [];

  for (const [index, config] of candidates.entries()) {
    const benchmark = await runEmailRlBenchmark({
      generatedAt,
      benchmarkIds: input.benchmarkIds,
      policyConfig: {
        gamma: config.gamma,
        supportPenalty: config.supportPenalty,
        behaviorPenalty: config.behaviorPenalty,
        similarityFloor: config.similarityFloor
      },
      maxWriteFields: config.maxWriteFields,
      maxReadFields: config.maxReadFields,
      maxExplainFields: config.maxExplainFields,
      trainingEpisodes: input.trainingEpisodes,
      appendSeedEpisodes: input.appendSeedEpisodes
    });

    results.push({
      candidateId: `candidate-${String(index + 1).padStart(3, "0")}`,
      config,
      objectiveScore: computeObjectiveScore(benchmark),
      summary: {
        reward: benchmark.rlPolicy.averageReward,
        coverage: benchmark.rlPolicy.coverage,
        rewardLiftPct: benchmark.rewardLiftPct,
        coverageLiftPct: benchmark.coverageLiftPct,
        benchmarks: benchmark.benchmarks
      }
    });
  }

  const ranked = [...results].sort(compareCandidates);
  const bestCandidate = ranked[0];
  if (!bestCandidate) {
    throw new Error("email rl sweep produced no candidates");
  }

  return {
    generatedAt,
    benchmarkIds: input.benchmarkIds?.length ? [...input.benchmarkIds] : [],
    experimentCount: results.length,
    objectiveFormula: "objective = rlReward + rlCoverage + rewardLiftPct/10 + coverageLiftPct/20",
    bestCandidate,
    topCandidates: ranked.slice(0, maxCandidates)
  };
}

export async function buildEmailRlSweepArtifacts(
  input: RunEmailRlSweepInput & {
    outputDir?: string;
  } = {}
): Promise<EmailRlSweepArtifactResult> {
  const generatedAt = input.generatedAt ?? defaultGeneratedAt;
  const outputDir = path.resolve(input.outputDir ?? path.join("output", "benchmarks", "email-rl-sweep"));
  const artifactsDir = path.join(outputDir, "artifacts");
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(artifactsDir, { recursive: true });

  const result = await runEmailRlSweep({
    ...input,
    generatedAt
  });
  const bestBenchmark = await runEmailRlBenchmark({
    generatedAt,
    benchmarkIds: input.benchmarkIds,
    trainingEpisodes: input.trainingEpisodes,
    appendSeedEpisodes: input.appendSeedEpisodes,
    policyConfig: {
      gamma: result.bestCandidate.config.gamma,
      supportPenalty: result.bestCandidate.config.supportPenalty,
      behaviorPenalty: result.bestCandidate.config.behaviorPenalty,
      similarityFloor: result.bestCandidate.config.similarityFloor
    },
    maxWriteFields: result.bestCandidate.config.maxWriteFields,
    maxReadFields: result.bestCandidate.config.maxReadFields,
    maxExplainFields: result.bestCandidate.config.maxExplainFields
  });

  writeFile(path.join(artifactsDir, "email-rl-sweep.json"), `${JSON.stringify(result, null, 2)}\n`);
  writeFile(path.join(artifactsDir, "email-rl-best-benchmark.json"), `${JSON.stringify(bestBenchmark, null, 2)}\n`);
  writeFile(path.join(artifactsDir, "email-rl-best-benchmark.md"), `${renderEmailRlBenchmarkMarkdown(bestBenchmark)}\n`);
  writeFile(path.join(artifactsDir, "email-rl-sweep.md"), `${renderEmailRlSweepMarkdown(result)}\n`);

  return {
    ...result,
    outputDir,
    artifactsDir,
    files: listFiles(outputDir)
  };
}

export function renderEmailRlSweepMarkdown(result: EmailRlSweepResult) {
  const lines = [
    "# Email RL Sweep",
    "",
    `Generated at: ${result.generatedAt}`,
    `Experiments: ${result.experimentCount}`,
    `Objective: ${result.objectiveFormula}`,
    result.benchmarkIds.length > 0 ? `Benchmarks: ${result.benchmarkIds.join(", ")}` : "Benchmarks: all",
    "",
    "## Best candidate",
    `- Candidate: ${result.bestCandidate.candidateId}`,
    `- Objective score: ${result.bestCandidate.objectiveScore}`,
    `- Config: gamma ${result.bestCandidate.config.gamma} | supportPenalty ${result.bestCandidate.config.supportPenalty} | behaviorPenalty ${result.bestCandidate.config.behaviorPenalty} | similarityFloor ${result.bestCandidate.config.similarityFloor} | fields write/read/explain ${result.bestCandidate.config.maxWriteFields}/${result.bestCandidate.config.maxReadFields}/${result.bestCandidate.config.maxExplainFields}`,
    `- Reward: ${result.bestCandidate.summary.reward}`,
    `- Coverage: ${result.bestCandidate.summary.coverage}`,
    `- Reward lift: ${result.bestCandidate.summary.rewardLiftPct}%`,
    `- Coverage lift: ${result.bestCandidate.summary.coverageLiftPct}%`,
    "",
    "## Top candidates"
  ];

  for (const candidate of result.topCandidates) {
    lines.push(
      `- ${candidate.candidateId}: objective ${candidate.objectiveScore} | reward ${candidate.summary.reward} | coverage ${candidate.summary.coverage} | cfg ${candidate.config.gamma}/${candidate.config.supportPenalty}/${candidate.config.behaviorPenalty}/${candidate.config.similarityFloor}/${candidate.config.maxWriteFields}/${candidate.config.maxReadFields}/${candidate.config.maxExplainFields}`
    );
  }

  return lines.join("\n");
}

function enumerateCandidateConfigs(input: RunEmailRlSweepInput): EmailRlSweepCandidateConfig[] {
  const gammaValues = input.gammaValues ?? [0.6, 0.72, 0.84];
  const supportPenaltyValues = input.supportPenaltyValues ?? [0.1, 0.18, 0.26];
  const behaviorPenaltyValues = input.behaviorPenaltyValues ?? [0.04, 0.08, 0.12];
  const similarityFloorValues = input.similarityFloorValues ?? [0.45, 0.55];
  const maxWriteFieldsValues = input.maxWriteFieldsValues ?? [4, 5];
  const maxReadFieldsValues = input.maxReadFieldsValues ?? [3, 4];
  const maxExplainFieldsValues = input.maxExplainFieldsValues ?? [3, 4];
  const configs: EmailRlSweepCandidateConfig[] = [];

  for (const gamma of gammaValues) {
    for (const supportPenalty of supportPenaltyValues) {
      for (const behaviorPenalty of behaviorPenaltyValues) {
        for (const similarityFloor of similarityFloorValues) {
          for (const maxWriteFields of maxWriteFieldsValues) {
            for (const maxReadFields of maxReadFieldsValues) {
              for (const maxExplainFields of maxExplainFieldsValues) {
                configs.push({
                  gamma,
                  supportPenalty,
                  behaviorPenalty,
                  similarityFloor,
                  maxWriteFields,
                  maxReadFields,
                  maxExplainFields
                });
              }
            }
          }
        }
      }
    }
  }

  return configs;
}

function computeObjectiveScore(result: EmailRlBenchmarkResult) {
  return roundTo(
    result.rlPolicy.averageReward +
      result.rlPolicy.coverage +
      result.rewardLiftPct / 10 +
      result.coverageLiftPct / 20
  );
}

function compareCandidates(left: EmailRlSweepCandidateResult, right: EmailRlSweepCandidateResult) {
  return (
    right.objectiveScore - left.objectiveScore ||
    right.summary.reward - left.summary.reward ||
    right.summary.coverage - left.summary.coverage ||
    left.candidateId.localeCompare(right.candidateId)
  );
}

function writeFile(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function listFiles(rootDir: string) {
  const files: Array<{ path: string; bytes: number }> = [];

  const walk = (dirPath: string) => {
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      const absolutePath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath);
        continue;
      }

      files.push({
        path: absolutePath,
        bytes: fs.statSync(absolutePath).size
      });
    }
  };

  walk(rootDir);
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function roundTo(value: number) {
  return Math.round(value * 1000) / 1000;
}
