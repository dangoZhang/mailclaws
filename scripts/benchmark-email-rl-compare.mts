import { buildEmailRlComparisonArtifacts, renderEmailRlComparisonMarkdown } from "../src/benchmarks/email-rl-compare.js";
import {
  buildDefaultEmailRlComparisonVariants,
  loadEmailRlComparisonManifest
} from "../src/benchmarks/email-rl-experiment-config.js";

const args = process.argv.slice(2);
const wantsJson = takeBooleanFlag(args, "--json");
const outputDir = takeFlagValue(args, "--output-dir");
const benchmarkIds = parseCsv(takeFlagValue(args, "--benchmark-ids"));
const episodesPath = takeFlagValue(args, "--episodes");
const configPath = takeFlagValue(args, "--config");
const config = configPath ? loadEmailRlComparisonManifest(configPath) : null;

const result = await buildEmailRlComparisonArtifacts({
  outputDir: outputDir ?? config?.outputDir,
  generatedAt: config?.generatedAt,
  variants: config?.variants ?? buildDefaultEmailRlComparisonVariants({ benchmarkIds, trainingEpisodesPath: episodesPath }),
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
