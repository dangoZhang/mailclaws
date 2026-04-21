import fs from "node:fs";
import path from "node:path";

import {
  renderEmailRlBenchmarkMarkdown,
  runEmailRlBenchmark,
  type EmailRlBenchmarkResult,
  type RunEmailRlBenchmarkInput
} from "./email-rl.js";

export interface EmailRlComparisonVariantInput extends RunEmailRlBenchmarkInput {
  variantId: string;
  title: string;
  description?: string;
}

export interface EmailRlComparisonBenchmarkDelta {
  benchmarkId: string;
  benchmarkName: string;
  rewardDelta: number;
  coverageDelta: number;
  rewardLiftDeltaPct: number;
  coverageLiftDeltaPct: number;
}

export interface EmailRlComparisonVariantResult {
  variantId: string;
  title: string;
  description?: string;
  objectiveScore: number;
  rewardDeltaVsAnchor: number;
  coverageDeltaVsAnchor: number;
  rewardLiftDeltaVsAnchorPct: number;
  coverageLiftDeltaVsAnchorPct: number;
  benchmarkDeltas: EmailRlComparisonBenchmarkDelta[];
  benchmark: EmailRlBenchmarkResult;
}

export interface EmailRlComparisonResult {
  generatedAt: string;
  benchmarkIds: string[];
  anchorVariantId: string;
  objectiveFormula: string;
  variants: EmailRlComparisonVariantResult[];
  ranking: string[];
}

export interface EmailRlComparisonArtifactResult extends EmailRlComparisonResult {
  outputDir: string;
  artifactsDir: string;
  files: Array<{
    path: string;
    bytes: number;
  }>;
}

export async function runEmailRlComparison(input: {
  generatedAt?: string;
  variants: EmailRlComparisonVariantInput[];
  anchorVariantId?: string;
}): Promise<EmailRlComparisonResult> {
  if (input.variants.length === 0) {
    throw new Error("email rl comparison requires at least one variant");
  }

  const variants = await Promise.all(
    input.variants.map(async (variant) => ({
      variantId: variant.variantId,
      title: variant.title,
      description: variant.description,
      benchmark: await runEmailRlBenchmark(variant)
    }))
  );

  const anchorVariantId = input.anchorVariantId ?? input.variants[0]?.variantId;
  const anchor = variants.find((variant) => variant.variantId === anchorVariantId);
  if (!anchor) {
    throw new Error(`email rl comparison anchor not found: ${anchorVariantId}`);
  }

  const comparisonVariants = variants.map((variant) =>
    toComparisonVariantResult({
      variant,
      anchor
    })
  );

  const ranked = [...comparisonVariants].sort(compareVariants);

  return {
    generatedAt: variants[0]?.benchmark.generatedAt ?? input.generatedAt ?? "",
    benchmarkIds: variants[0]?.benchmark.benchmarkIds ?? [],
    anchorVariantId,
    objectiveFormula: "objective = rlReward + rlCoverage + rewardLiftPct/10 + coverageLiftPct/20",
    variants: comparisonVariants,
    ranking: ranked.map((variant) => variant.variantId)
  };
}

export async function buildEmailRlComparisonArtifacts(input: {
  generatedAt?: string;
  variants: EmailRlComparisonVariantInput[];
  anchorVariantId?: string;
  outputDir?: string;
}): Promise<EmailRlComparisonArtifactResult> {
  const outputDir = path.resolve(input.outputDir ?? path.join("output", "benchmarks", "email-rl-compare"));
  const artifactsDir = path.join(outputDir, "artifacts");
  const variantsDir = path.join(artifactsDir, "variants");
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(variantsDir, { recursive: true });

  const result = await runEmailRlComparison(input);

  writeFile(path.join(artifactsDir, "email-rl-compare.json"), `${JSON.stringify(result, null, 2)}\n`);
  writeFile(path.join(artifactsDir, "email-rl-compare.md"), `${renderEmailRlComparisonMarkdown(result)}\n`);

  for (const variant of result.variants) {
    writeFile(path.join(variantsDir, `${variant.variantId}.benchmark.json`), `${JSON.stringify(variant.benchmark, null, 2)}\n`);
    writeFile(path.join(variantsDir, `${variant.variantId}.benchmark.md`), `${renderEmailRlBenchmarkMarkdown(variant.benchmark)}\n`);
  }

  return {
    ...result,
    outputDir,
    artifactsDir,
    files: listFiles(outputDir)
  };
}

export function renderEmailRlComparisonMarkdown(result: EmailRlComparisonResult) {
  const anchor = result.variants.find((variant) => variant.variantId === result.anchorVariantId);
  const rankedVariants = result.ranking
    .map((variantId) => result.variants.find((variant) => variant.variantId === variantId))
    .filter((variant): variant is EmailRlComparisonVariantResult => Boolean(variant));

  const lines = [
    "# Email RL Comparison",
    "",
    `Generated at: ${result.generatedAt}`,
    `Benchmarks: ${result.benchmarkIds.join(", ")}`,
    `Anchor variant: ${result.anchorVariantId}`,
    `Objective: ${result.objectiveFormula}`,
    ""
  ];

  if (anchor) {
    lines.push(
      "## Anchor snapshot",
      `- ${anchor.title}: reward ${anchor.benchmark.rlPolicy.averageReward} | coverage ${anchor.benchmark.rlPolicy.coverage} | training episodes ${anchor.benchmark.trainingEpisodeCount}`,
      ""
    );
  }

  lines.push("## Ranked variants");

  for (const variant of rankedVariants) {
    lines.push(
      `- ${variant.variantId}: objective ${variant.objectiveScore} | reward ${variant.benchmark.rlPolicy.averageReward} | coverage ${variant.benchmark.rlPolicy.coverage} | delta vs anchor reward ${variant.rewardDeltaVsAnchor} | coverage ${variant.coverageDeltaVsAnchor}`
    );
  }

  for (const variant of rankedVariants) {
    lines.push("", `## ${variant.variantId}`, `- Title: ${variant.title}`);
    if (variant.description) {
      lines.push(`- Notes: ${variant.description}`);
    }
    lines.push(
      `- Training episodes: ${variant.benchmark.trainingEpisodeCount} (${variant.benchmark.trainingDatasetIds.join(", ")})`,
      `- RL reward / coverage: ${variant.benchmark.rlPolicy.averageReward} / ${variant.benchmark.rlPolicy.coverage}`,
      `- Delta vs anchor reward / coverage: ${variant.rewardDeltaVsAnchor} / ${variant.coverageDeltaVsAnchor}`
    );

    if (variant.benchmarkDeltas.length > 0) {
      lines.push("- Benchmark deltas:");
      for (const benchmarkDelta of variant.benchmarkDeltas) {
        lines.push(
          `  - ${benchmarkDelta.benchmarkName}: reward ${benchmarkDelta.rewardDelta} | coverage ${benchmarkDelta.coverageDelta}`
        );
      }
    }
  }

  return lines.join("\n");
}

function toComparisonVariantResult(input: {
  variant: {
    variantId: string;
    title: string;
    description?: string;
    benchmark: EmailRlBenchmarkResult;
  };
  anchor: {
    variantId: string;
    title: string;
    description?: string;
    benchmark: EmailRlBenchmarkResult;
  };
}): EmailRlComparisonVariantResult {
  return {
    variantId: input.variant.variantId,
    title: input.variant.title,
    description: input.variant.description,
    objectiveScore: computeObjectiveScore(input.variant.benchmark),
    rewardDeltaVsAnchor: roundTo(
      input.variant.benchmark.rlPolicy.averageReward - input.anchor.benchmark.rlPolicy.averageReward
    ),
    coverageDeltaVsAnchor: roundTo(input.variant.benchmark.rlPolicy.coverage - input.anchor.benchmark.rlPolicy.coverage),
    rewardLiftDeltaVsAnchorPct: roundTo(input.variant.benchmark.rewardLiftPct - input.anchor.benchmark.rewardLiftPct),
    coverageLiftDeltaVsAnchorPct: roundTo(
      input.variant.benchmark.coverageLiftPct - input.anchor.benchmark.coverageLiftPct
    ),
    benchmarkDeltas: buildBenchmarkDeltas(input.variant.benchmark, input.anchor.benchmark),
    benchmark: input.variant.benchmark
  };
}

function buildBenchmarkDeltas(
  variant: EmailRlBenchmarkResult,
  anchor: EmailRlBenchmarkResult
): EmailRlComparisonBenchmarkDelta[] {
  const anchorById = new Map(anchor.benchmarks.map((benchmark) => [benchmark.benchmarkId, benchmark]));

  return variant.benchmarks
    .map((benchmark) => {
      const anchorBenchmark = anchorById.get(benchmark.benchmarkId);
      if (!anchorBenchmark) {
        return null;
      }

      return {
        benchmarkId: benchmark.benchmarkId,
        benchmarkName: benchmark.benchmarkName,
        rewardDelta: roundTo(benchmark.rlReward - anchorBenchmark.rlReward),
        coverageDelta: roundTo(benchmark.rlCoverage - anchorBenchmark.rlCoverage),
        rewardLiftDeltaPct: roundTo(benchmark.rewardLiftPct - anchorBenchmark.rewardLiftPct),
        coverageLiftDeltaPct: roundTo(benchmark.coverageLiftPct - anchorBenchmark.coverageLiftPct)
      };
    })
    .filter((entry): entry is EmailRlComparisonBenchmarkDelta => entry !== null)
    .sort((left, right) => right.rewardDelta - left.rewardDelta || left.benchmarkId.localeCompare(right.benchmarkId));
}

function computeObjectiveScore(result: EmailRlBenchmarkResult) {
  return roundTo(
    result.rlPolicy.averageReward +
      result.rlPolicy.coverage +
      result.rewardLiftPct / 10 +
      result.coverageLiftPct / 20
  );
}

function compareVariants(left: EmailRlComparisonVariantResult, right: EmailRlComparisonVariantResult) {
  return (
    right.objectiveScore - left.objectiveScore ||
    right.benchmark.rlPolicy.averageReward - left.benchmark.rlPolicy.averageReward ||
    right.benchmark.rlPolicy.coverage - left.benchmark.rlPolicy.coverage ||
    left.variantId.localeCompare(right.variantId)
  );
}

function roundTo(value: number) {
  return Math.round(value * 1000) / 1000;
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
  files.sort((left, right) => left.path.localeCompare(right.path));
  return files;
}
