import path from "node:path";

import {
  importEmailTrajectoryRecords,
  loadExternalEmailCorpusRecords,
  writeEmailTrajectoryEpisodes,
  type EmailTrajectoryImportProfile
} from "../src/email/trajectory-import.js";

const args = process.argv.slice(2);
const wantsJson = takeBooleanFlag(args, "--json");
const inputPath = takeFlagValue(args, "--input");

if (!inputPath) {
  console.error(
    "usage: tsx scripts/import-email-trajectories.mts --input <records.json|records.jsonl> [--output <episodes.json|episodes.jsonl>] [--profile <generic|emailsum|bc3|radar-action-items|mailex|enronsr-reply-alignment>] [--dataset-id <id>] [--mode <read|write|explain>] [--json]"
  );
  process.exit(1);
}

const profile = (takeFlagValue(args, "--profile") as EmailTrajectoryImportProfile | undefined) ?? "generic";
const outputPath =
  takeFlagValue(args, "--output") ??
  path.join("output", "email-trajectories", `${path.basename(inputPath).replace(/\.[^.]+$/, "")}.${profile}.jsonl`);
const datasetId = takeFlagValue(args, "--dataset-id");
const defaultMode = takeFlagValue(args, "--mode") as "read" | "write" | "explain" | undefined;
const records = loadExternalEmailCorpusRecords(inputPath);
const result = importEmailTrajectoryRecords(records, {
  profile,
  datasetId,
  defaultMode
});
const writtenPath = writeEmailTrajectoryEpisodes(outputPath, result.episodes);

if (wantsJson) {
  console.log(
    JSON.stringify(
      {
        ...result,
        outputPath: writtenPath
      },
      null,
      2
    )
  );
  process.exit(0);
}

console.log(renderImportSummary({ ...result, outputPath: writtenPath }));

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

function renderImportSummary(
  result: ReturnType<typeof importEmailTrajectoryRecords> & {
    outputPath: string;
  }
) {
  const lines = [
    "# Email Trajectory Import",
    "",
    `Profile: ${result.profile}`,
    `Imported episodes: ${result.importedRecordCount}`,
    `Skipped records: ${result.skippedRecordCount}`,
    `Datasets: ${result.datasetIds.join(", ") || "none"}`,
    `Output: ${result.outputPath}`,
    "",
    "## Action histogram"
  ];

  for (const [action, count] of Object.entries(result.actionHistogram)) {
    lines.push(`- ${action}: ${count}`);
  }

  if (result.skippedRecords.length > 0) {
    lines.push("", "## Skipped records");
    for (const skipped of result.skippedRecords.slice(0, 5)) {
      lines.push(`- ${skipped.recordId}: ${skipped.reason}`);
    }
  }

  return lines.join("\n");
}
