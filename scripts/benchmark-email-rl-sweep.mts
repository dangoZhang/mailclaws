import { buildEmailRlSweepArtifacts, renderEmailRlSweepMarkdown } from "../src/benchmarks/email-rl-sweep.js";
import { loadEmailTrajectoryEpisodes } from "../src/email/trajectory-import.js";

const args = process.argv.slice(2);
const wantsJson = takeBooleanFlag(args, "--json");
const appendSeedEpisodes = takeBooleanFlag(args, "--append-seeds");
const outputDir = takeFlagValue(args, "--output-dir");
const benchmarkIds = parseCsv(takeFlagValue(args, "--benchmark-ids"));
const episodesPath = takeFlagValue(args, "--episodes");
const trainingEpisodes = episodesPath ? loadEmailTrajectoryEpisodes(episodesPath) : undefined;

const result = await buildEmailRlSweepArtifacts({
  outputDir,
  benchmarkIds,
  trainingEpisodes,
  appendSeedEpisodes
});

if (wantsJson) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

console.log(renderEmailRlSweepMarkdown(result));

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
