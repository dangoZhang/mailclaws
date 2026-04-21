import fs from "node:fs";
import path from "node:path";

import type { OfflineEmailPolicyConfig } from "../email/offline-rl.js";
import { loadEmailTrajectoryEpisodes } from "../email/trajectory-import.js";

import type { EmailRlComparisonVariantInput } from "./email-rl-compare.js";

export const emailRlPolicyPresets = {
  tuned: {
    policyConfig: {
      gamma: 0.6,
      supportPenalty: 0.1,
      behaviorPenalty: 0.04,
      similarityFloor: 0.45
    },
    maxWriteFields: 4,
    maxReadFields: 3,
    maxExplainFields: 4
  }
} as const;

export type EmailRlPolicyPresetName = keyof typeof emailRlPolicyPresets;

export interface EmailRlComparisonVariantManifest {
  variantId: string;
  title: string;
  description?: string;
  benchmarkIds?: string[];
  episodes?: string | string[];
  appendSeedEpisodes?: boolean;
  preset?: EmailRlPolicyPresetName;
  policyConfig?: OfflineEmailPolicyConfig;
  maxWriteFields?: number;
  maxReadFields?: number;
  maxExplainFields?: number;
}

export interface EmailRlComparisonManifest {
  generatedAt?: string;
  benchmarkIds?: string[];
  anchorVariantId?: string;
  outputDir?: string;
  variants: EmailRlComparisonVariantManifest[];
}

export interface LoadedEmailRlComparisonManifest {
  generatedAt?: string;
  anchorVariantId?: string;
  outputDir?: string;
  variants: EmailRlComparisonVariantInput[];
}

export function getEmailRlPolicyPreset(name: EmailRlPolicyPresetName) {
  return emailRlPolicyPresets[name];
}

export function buildDefaultEmailRlComparisonVariants(input: {
  benchmarkIds?: string[];
  trainingEpisodesPath?: string;
}) {
  const trainingEpisodes = input.trainingEpisodesPath
    ? loadEmailTrajectoryEpisodes(path.resolve(input.trainingEpisodesPath))
    : undefined;
  const tunedPreset = getEmailRlPolicyPreset("tuned");
  const variants: EmailRlComparisonVariantInput[] = [
    {
      variantId: "seed-default",
      title: "Seed trajectories + default policy",
      benchmarkIds: input.benchmarkIds
    },
    {
      variantId: "seed-tuned",
      title: "Seed trajectories + tuned policy",
      benchmarkIds: input.benchmarkIds,
      policyConfig: tunedPreset.policyConfig,
      maxWriteFields: tunedPreset.maxWriteFields,
      maxReadFields: tunedPreset.maxReadFields,
      maxExplainFields: tunedPreset.maxExplainFields
    }
  ];

  if (trainingEpisodes) {
    variants.push(
      {
        variantId: "imported-default",
        title: "Imported trajectories + default policy",
        benchmarkIds: input.benchmarkIds,
        trainingEpisodes
      },
      {
        variantId: "seed-plus-imported-default",
        title: "Seed + imported trajectories + default policy",
        benchmarkIds: input.benchmarkIds,
        trainingEpisodes,
        appendSeedEpisodes: true
      },
      {
        variantId: "imported-tuned",
        title: "Imported trajectories + tuned policy",
        benchmarkIds: input.benchmarkIds,
        trainingEpisodes,
        policyConfig: tunedPreset.policyConfig,
        maxWriteFields: tunedPreset.maxWriteFields,
        maxReadFields: tunedPreset.maxReadFields,
        maxExplainFields: tunedPreset.maxExplainFields
      },
      {
        variantId: "seed-plus-imported-tuned",
        title: "Seed + imported trajectories + tuned policy",
        benchmarkIds: input.benchmarkIds,
        trainingEpisodes,
        appendSeedEpisodes: true,
        policyConfig: tunedPreset.policyConfig,
        maxWriteFields: tunedPreset.maxWriteFields,
        maxReadFields: tunedPreset.maxReadFields,
        maxExplainFields: tunedPreset.maxExplainFields
      }
    );
  }

  return variants;
}

export function loadEmailRlComparisonManifest(filePath: string): LoadedEmailRlComparisonManifest {
  const absolutePath = path.resolve(filePath);
  const manifestDir = path.dirname(absolutePath);
  const manifest = JSON.parse(fs.readFileSync(absolutePath, "utf8")) as EmailRlComparisonManifest;

  if (!Array.isArray(manifest.variants) || manifest.variants.length === 0) {
    throw new Error("email rl comparison manifest requires a non-empty variants array");
  }

  return {
    generatedAt: manifest.generatedAt,
    anchorVariantId: manifest.anchorVariantId,
    outputDir: manifest.outputDir ? path.resolve(manifestDir, manifest.outputDir) : undefined,
    variants: manifest.variants.map((variant) =>
      resolveManifestVariant({
        variant,
        manifestDir,
        defaultBenchmarkIds: manifest.benchmarkIds,
        generatedAt: manifest.generatedAt
      })
    )
  };
}

function resolveManifestVariant(input: {
  variant: EmailRlComparisonVariantManifest;
  manifestDir: string;
  defaultBenchmarkIds?: string[];
  generatedAt?: string;
}): EmailRlComparisonVariantInput {
  const preset = input.variant.preset ? getEmailRlPolicyPreset(input.variant.preset) : undefined;
  const episodePaths = toStringArray(input.variant.episodes);
  const trainingEpisodes =
    episodePaths.length > 0
      ? episodePaths.flatMap((episodePath) => loadEmailTrajectoryEpisodes(path.resolve(input.manifestDir, episodePath)))
      : undefined;

  return {
    variantId: input.variant.variantId,
    title: input.variant.title,
    description: input.variant.description,
    generatedAt: input.generatedAt,
    benchmarkIds: input.variant.benchmarkIds ?? input.defaultBenchmarkIds,
    trainingEpisodes: trainingEpisodes && trainingEpisodes.length > 0 ? trainingEpisodes : undefined,
    appendSeedEpisodes: input.variant.appendSeedEpisodes,
    policyConfig: input.variant.policyConfig ?? preset?.policyConfig,
    maxWriteFields: input.variant.maxWriteFields ?? preset?.maxWriteFields,
    maxReadFields: input.variant.maxReadFields ?? preset?.maxReadFields,
    maxExplainFields: input.variant.maxExplainFields ?? preset?.maxExplainFields
  };
}

function toStringArray(value: string | string[] | undefined) {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}
