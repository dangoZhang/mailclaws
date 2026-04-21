import { buildEmailRlComparisonArtifacts, renderEmailRlComparisonMarkdown } from "../src/benchmarks/email-rl-compare.js";
import {
  buildDefaultEmailRlComparisonVariants,
  buildEmailRlPresetComparisonVariants,
  type EmailRlPolicyPresetName,
  type EmailRlPolicyPresetPackName,
  getEmailRlPolicyPresetPack,
  listEmailRlPolicyPresetPacks,
  listEmailRlPolicyPresets,
  loadEmailRlComparisonManifest
} from "../src/benchmarks/email-rl-experiment-config.js";

const args = process.argv.slice(2);
const wantsJson = takeBooleanFlag(args, "--json");
const wantsPresetList = takeBooleanFlag(args, "--list-presets");
const wantsPresetPackList = takeBooleanFlag(args, "--list-preset-packs");
const includeDefaultVariant = !takeBooleanFlag(args, "--no-default");
const appendSeedEpisodes = takeBooleanFlag(args, "--append-seeds");
const outputDir = takeFlagValue(args, "--output-dir");
const benchmarkIds = parseCsv(takeFlagValue(args, "--benchmark-ids"));
const episodesPath = takeFlagValue(args, "--episodes");
const configPath = takeFlagValue(args, "--config");
const presetNames = parseCsv(takeFlagValue(args, "--presets"));
const presetPack = takeFlagValue(args, "--preset-pack");
const config = configPath ? loadEmailRlComparisonManifest(configPath) : null;

if (wantsPresetList) {
  console.log(
    JSON.stringify(
      listEmailRlPolicyPresets().map((preset) => ({
        presetName: preset.presetName,
        title: preset.title,
        goal: preset.goal,
        fields: `${preset.maxWriteFields}/${preset.maxReadFields}/${preset.maxExplainFields}`
      })),
      null,
      2
    )
  );
  process.exit(0);
}

if (wantsPresetPackList) {
  console.log(JSON.stringify(listEmailRlPolicyPresetPacks(), null, 2));
  process.exit(0);
}

const selectedPresetNames =
  parsePresetNames(presetNames) ??
  (presetPack ? [...getEmailRlPolicyPresetPack(presetPack as EmailRlPolicyPresetPackName)] : undefined);
const variants =
  config?.variants ??
  (selectedPresetNames
    ? buildEmailRlPresetComparisonVariants({
        benchmarkIds,
        trainingEpisodesPath: episodesPath,
        appendSeedEpisodes,
        presetNames: selectedPresetNames,
        includeDefaultVariant
      })
    : buildDefaultEmailRlComparisonVariants({ benchmarkIds, trainingEpisodesPath: episodesPath }));

const result = await buildEmailRlComparisonArtifacts({
  outputDir: outputDir ?? config?.outputDir,
  generatedAt: config?.generatedAt,
  variants,
  anchorVariantId: config?.anchorVariantId ?? "seed-default"
});

if (wantsJson) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

console.log(renderEmailRlComparisonMarkdown(result));

function takeBooleanFlag(args: string[], flag: string) {
  const index = args.indexOf(flag);
  if (index >= 0) {
    args.splice(index, 1);
    return true;
  }
  return false;
}

function takeFlagValue(args: string[], flag: string) {
  const index = args.indexOf(flag);
  if (index < 0) {
    return undefined;
  }

  const value = args[index + 1];
  args.splice(index, value ? 2 : 1);
  return value;
}

function parseCsv(value: string | undefined) {
  return value
    ?.split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function parsePresetNames(value: string[] | undefined) {
  return value as EmailRlPolicyPresetName[] | undefined;
}
