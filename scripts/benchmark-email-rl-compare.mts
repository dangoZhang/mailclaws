import { buildEmailRlComparisonArtifacts, renderEmailRlComparisonMarkdown } from "../src/benchmarks/email-rl-compare.js";
import { loadEmailTrajectoryEpisodes } from "../src/email/trajectory-import.js";

const tunedPreset = {
  gamma: 0.6,
  supportPenalty: 0.1,
  behaviorPenalty: 0.04,
  similarityFloor: 0.45,
  maxWriteFields: 4,
  maxReadFields: 3,
  maxExplainFields: 4
};

const args = process.argv.slice(2);
const wantsJson = takeBooleanFlag(args, "--json");
const outputDir = takeFlagValue(args, "--output-dir");
const benchmarkIds = parseCsv(takeFlagValue(args, "--benchmark-ids"));
const episodesPath = takeFlagValue(args, "--episodes");
const trainingEpisodes = episodesPath ? loadEmailTrajectoryEpisodes(episodesPath) : undefined;

const variants = [
  {
    variantId: "seed-default",
    title: "Seed trajectories + default policy",
    benchmarkIds
  },
  {
    variantId: "seed-tuned",
    title: "Seed trajectories + tuned policy",
    benchmarkIds,
    policyConfig: tunedPreset,
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
      benchmarkIds,
      trainingEpisodes
    },
    {
      variantId: "seed-plus-imported-default",
      title: "Seed + imported trajectories + default policy",
      benchmarkIds,
      trainingEpisodes,
      appendSeedEpisodes: true
    },
    {
      variantId: "imported-tuned",
      title: "Imported trajectories + tuned policy",
      benchmarkIds,
      trainingEpisodes,
      policyConfig: tunedPreset,
      maxWriteFields: tunedPreset.maxWriteFields,
      maxReadFields: tunedPreset.maxReadFields,
      maxExplainFields: tunedPreset.maxExplainFields
    },
    {
      variantId: "seed-plus-imported-tuned",
      title: "Seed + imported trajectories + tuned policy",
      benchmarkIds,
      trainingEpisodes,
      appendSeedEpisodes: true,
      policyConfig: tunedPreset,
      maxWriteFields: tunedPreset.maxWriteFields,
      maxReadFields: tunedPreset.maxReadFields,
      maxExplainFields: tunedPreset.maxExplainFields
    }
  );
}

const result = await buildEmailRlComparisonArtifacts({
  outputDir,
  variants,
  anchorVariantId: "seed-default"
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
