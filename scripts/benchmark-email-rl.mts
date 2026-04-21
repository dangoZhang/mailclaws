import { renderEmailRlBenchmarkMarkdown, runEmailRlBenchmark } from "../src/benchmarks/email-rl.js";

const result = await runEmailRlBenchmark();
const wantsJson = process.argv.includes("--json");

if (wantsJson) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

console.log(renderEmailRlBenchmarkMarkdown(result));
