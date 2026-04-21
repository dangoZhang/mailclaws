import fs from "node:fs";
import path from "node:path";

import type { OfflineEmailPolicyConfig } from "../email/offline-rl.js";
import { loadEmailTrajectoryEpisodes } from "../email/trajectory-import.js";

import type { EmailRlComparisonVariantInput } from "./email-rl-compare.js";

export interface EmailRlPolicyPresetDefinition {
  title: string;
  goal: string;
  policyConfig: OfflineEmailPolicyConfig;
  maxWriteFields: number;
  maxReadFields: number;
  maxExplainFields: number;
}

export const emailRlPolicyPresets = {
  conservative: {
    title: "Conservative",
    goal: "Prefer high-support fields and keep packets compact when the reward signal is sparse.",
    policyConfig: {
      gamma: 0.72,
      supportPenalty: 0.26,
      behaviorPenalty: 0.12,
      similarityFloor: 0.55
    },
    maxWriteFields: 4,
    maxReadFields: 3,
    maxExplainFields: 3
  },
  tuned: {
    title: "Tuned",
    goal: "Best sweep result so far for the current seed benchmark suite.",
    policyConfig: {
      gamma: 0.6,
      supportPenalty: 0.1,
      behaviorPenalty: 0.04,
      similarityFloor: 0.45
    },
    maxWriteFields: 4,
    maxReadFields: 3,
    maxExplainFields: 4
  },
  "coverage-heavy": {
    title: "Coverage heavy",
    goal: "Trade some compactness for broader context retention on noisy read and explain cases.",
    policyConfig: {
      gamma: 0.6,
      supportPenalty: 0.1,
      behaviorPenalty: 0.04,
      similarityFloor: 0.35
    },
    maxWriteFields: 5,
    maxReadFields: 4,
    maxExplainFields: 5
  },
  "reply-heavy": {
    title: "Reply heavy",
    goal: "Bias write packets toward preserving drafting evidence, style, and deadline context.",
    policyConfig: {
      gamma: 0.6,
      supportPenalty: 0.1,
      behaviorPenalty: 0.04,
      similarityFloor: 0.45
    },
    maxWriteFields: 5,
    maxReadFields: 3,
    maxExplainFields: 4
  },
  "summary-heavy": {
    title: "Summary heavy",
    goal: "Keep more context in explain flows for summary, rationale, and long-thread review.",
    policyConfig: {
      gamma: 0.72,
      supportPenalty: 0.18,
      behaviorPenalty: 0.08,
      similarityFloor: 0.55
    },
    maxWriteFields: 4,
    maxReadFields: 4,
    maxExplainFields: 5
  }
} as const satisfies Record<string, EmailRlPolicyPresetDefinition>;

export const emailRlPolicyPresetPacks = {
  all: ["conservative", "tuned", "coverage-heavy", "reply-heavy", "summary-heavy"],
  "read-write": ["conservative", "tuned", "coverage-heavy", "reply-heavy"],
  explain: ["conservative", "tuned", "coverage-heavy", "summary-heavy"]
} as const satisfies Record<string, readonly string[]>;

export type EmailRlPolicyPresetName = keyof typeof emailRlPolicyPresets;
export type EmailRlPolicyPresetPackName = keyof typeof emailRlPolicyPresetPacks;

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
  episodes?: string | string[];
  appendSeedEpisodes?: boolean;
  presetNames?: EmailRlPolicyPresetName[];
  presetPack?: EmailRlPolicyPresetPackName;
  includeDefaultVariant?: boolean;
  variants?: EmailRlComparisonVariantManifest[];
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

export function listEmailRlPolicyPresets() {
  return Object.entries(emailRlPolicyPresets).map(([presetName, preset]) => ({
    presetName: presetName as EmailRlPolicyPresetName,
    ...preset
  }));
}

export function getEmailRlPolicyPresetPack(name: EmailRlPolicyPresetPackName) {
  return emailRlPolicyPresetPacks[name];
}

export function listEmailRlPolicyPresetPacks() {
  return Object.entries(emailRlPolicyPresetPacks).map(([packName, presetNames]) => ({
    packName: packName as EmailRlPolicyPresetPackName,
    presetNames: [...presetNames] as EmailRlPolicyPresetName[]
  }));
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

export function buildEmailRlPresetComparisonVariants(input: {
  benchmarkIds?: string[];
  trainingEpisodesPath?: string | string[];
  appendSeedEpisodes?: boolean;
  presetNames?: EmailRlPolicyPresetName[];
  includeDefaultVariant?: boolean;
}) {
  const trainingEpisodePaths = toStringArray(input.trainingEpisodesPath);
  const trainingEpisodes =
    trainingEpisodePaths.length > 0
      ? trainingEpisodePaths.flatMap((episodePath) => loadEmailTrajectoryEpisodes(path.resolve(episodePath)))
      : undefined;
  const presetNames = normalizePresetNames(input.presetNames);
  const includeDefaultVariant = input.includeDefaultVariant ?? true;
  const variantLabel = resolveVariantLabel({
    hasImportedEpisodes: Boolean(trainingEpisodes),
    appendSeedEpisodes: input.appendSeedEpisodes ?? false
  });
  const variants: EmailRlComparisonVariantInput[] = [];

  if (includeDefaultVariant) {
    variants.push({
      variantId: `${variantLabel.variantIdPrefix}-default`,
      title: `${variantLabel.titlePrefix} + default policy`,
      benchmarkIds: input.benchmarkIds,
      trainingEpisodes,
      appendSeedEpisodes: trainingEpisodes ? input.appendSeedEpisodes : undefined
    });
  }

  for (const presetName of presetNames) {
    const preset = getEmailRlPolicyPreset(presetName);
    variants.push({
      variantId: `${variantLabel.variantIdPrefix}-${presetName}`,
      title: `${variantLabel.titlePrefix} + ${preset.title} preset`,
      description: `${preset.goal} Budgets write/read/explain ${preset.maxWriteFields}/${preset.maxReadFields}/${preset.maxExplainFields}.`,
      benchmarkIds: input.benchmarkIds,
      trainingEpisodes,
      appendSeedEpisodes: trainingEpisodes ? input.appendSeedEpisodes : undefined,
      policyConfig: preset.policyConfig,
      maxWriteFields: preset.maxWriteFields,
      maxReadFields: preset.maxReadFields,
      maxExplainFields: preset.maxExplainFields
    });
  }

  return variants;
}

export function loadEmailRlComparisonManifest(filePath: string): LoadedEmailRlComparisonManifest {
  const absolutePath = path.resolve(filePath);
  const manifestDir = path.dirname(absolutePath);
  const manifest = JSON.parse(fs.readFileSync(absolutePath, "utf8")) as EmailRlComparisonManifest;

  const variants = resolveManifestVariants(manifest, manifestDir);

  return {
    generatedAt: manifest.generatedAt,
    anchorVariantId: manifest.anchorVariantId,
    outputDir: manifest.outputDir ? path.resolve(manifestDir, manifest.outputDir) : undefined,
    variants
  };
}

function resolveManifestVariants(manifest: EmailRlComparisonManifest, manifestDir: string) {
  if (Array.isArray(manifest.variants) && manifest.variants.length > 0) {
    return manifest.variants.map((variant) =>
      resolveManifestVariant({
        variant,
        manifestDir,
        defaultBenchmarkIds: manifest.benchmarkIds,
        generatedAt: manifest.generatedAt
      })
    );
  }

  const presetNames =
    manifest.presetNames ??
    (manifest.presetPack ? [...getEmailRlPolicyPresetPack(manifest.presetPack)] : undefined);

  if (!presetNames || presetNames.length === 0) {
    throw new Error("email rl comparison manifest requires variants or a preset pack");
  }

  return buildEmailRlPresetComparisonVariants({
    benchmarkIds: manifest.benchmarkIds,
    trainingEpisodesPath: resolveEpisodePaths(manifestDir, manifest.episodes),
    appendSeedEpisodes: manifest.appendSeedEpisodes,
    presetNames,
    includeDefaultVariant: manifest.includeDefaultVariant
  });
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

function resolveEpisodePaths(manifestDir: string, value: string | string[] | undefined) {
  const episodePaths = toStringArray(value);
  return episodePaths.map((episodePath) => path.resolve(manifestDir, episodePath));
}

function normalizePresetNames(presetNames: EmailRlPolicyPresetName[] | undefined) {
  const names = presetNames?.length ? presetNames : (["tuned"] as EmailRlPolicyPresetName[]);
  return [...new Set(names)];
}

function resolveVariantLabel(input: { hasImportedEpisodes: boolean; appendSeedEpisodes: boolean }) {
  if (!input.hasImportedEpisodes) {
    return {
      variantIdPrefix: "seed",
      titlePrefix: "Seed trajectories"
    };
  }

  if (input.appendSeedEpisodes) {
    return {
      variantIdPrefix: "seed-plus-imported",
      titlePrefix: "Seed + imported trajectories"
    };
  }

  return {
    variantIdPrefix: "imported",
    titlePrefix: "Imported trajectories"
  };
}
