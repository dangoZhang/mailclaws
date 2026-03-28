import { runPromptFootprintBenchmark } from "../src/benchmarks/prompt-footprint.js";

const result = await runPromptFootprintBenchmark();
const wantsJson = process.argv.includes("--json");

if (wantsJson) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

function formatScenario(label: string, scenario: (typeof result)[keyof typeof result]) {
  if (!scenario || typeof scenario !== "object" || !("current" in scenario) || !("baseline" in scenario)) {
    return null;
  }

  return [
    `${label}`,
    `  current:  ${scenario.current.estimatedTokens} est. tokens (${scenario.current.characters} chars)`,
    `  baseline: ${scenario.baseline.estimatedTokens} est. tokens (${scenario.baseline.characters} chars)`,
    `  reduction: ${scenario.estimatedReductionPct}%`,
    ...scenario.notes.map((note) => `  note: ${note}`)
  ].join("\n");
}

const sections = [
  "MailClaw prompt footprint benchmark",
  `Generated at: ${result.generatedAt}`,
  `Estimate method: ${result.estimateMethod}`,
  "",
  formatScenario("Transcript follow-up average", result.transcriptFollowUpAverage),
  "",
  formatScenario("Transcript follow-up final turn", result.transcriptFollowUpFinalTurn),
  "",
  formatScenario("Multi-agent reducer handoff", result.multiAgentReducer)
].filter((section): section is string => Boolean(section));

console.log(sections.join("\n"));
