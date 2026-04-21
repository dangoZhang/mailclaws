import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { buildEmailRlComparisonArtifacts, runEmailRlComparison } from "../src/benchmarks/email-rl-compare.js";
import { importEmailTrajectoryRecords } from "../src/email/trajectory-import.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("email rl comparison", () => {
  it("compares multiple training variants against an anchor run", async () => {
    const imported = importEmailTrajectoryRecords(
      [
        {
          threadId: "compare-001",
          mode: "write",
          subject: "Need pricing reply by Friday",
          body: "Please send the pricing reply by Friday and use the attached quote.",
          attachments: [
            {
              filename: "quote.pdf",
              summaryText: "Draft quote for the pilot package."
            }
          ],
          annotations: {
            actions: {
              ask: ["Send the pricing reply"],
              deadline: ["Friday"],
              artifact: ["quote.pdf"]
            }
          }
        }
      ],
      {
        profile: "generic"
      }
    ).episodes;

    const result = await runEmailRlComparison({
      variants: [
        {
          variantId: "seed-default",
          title: "Seed default",
          benchmarkIds: ["enronsr-reply-alignment"]
        },
        {
          variantId: "imported-default",
          title: "Imported default",
          benchmarkIds: ["enronsr-reply-alignment"],
          trainingEpisodes: imported
        }
      ],
      anchorVariantId: "seed-default"
    });

    expect(result.anchorVariantId).toBe("seed-default");
    expect(result.variants).toHaveLength(2);
    expect(result.ranking).toEqual(expect.arrayContaining(["seed-default", "imported-default"]));
    expect(result.variants[1]?.benchmarkDeltas).toHaveLength(1);
  });

  it("writes comparison artifacts and per-variant benchmark reports", async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaws-email-rl-compare-"));
    tempDirs.push(outputDir);

    const result = await buildEmailRlComparisonArtifacts({
      outputDir,
      variants: [
        {
          variantId: "seed-default",
          title: "Seed default",
          benchmarkIds: ["bc3-thread-summary"]
        },
        {
          variantId: "seed-tuned",
          title: "Seed tuned",
          benchmarkIds: ["bc3-thread-summary"],
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
      ]
    });

    expect(result.files.map((entry) => path.basename(entry.path))).toEqual(
      expect.arrayContaining([
        "email-rl-compare.json",
        "email-rl-compare.md",
        "seed-default.benchmark.json",
        "seed-tuned.benchmark.md"
      ])
    );
  });
});
