import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildDefaultEmailRlComparisonVariants,
  getEmailRlPolicyPreset,
  loadEmailRlComparisonManifest
} from "../src/benchmarks/email-rl-experiment-config.js";
import { importEmailTrajectoryRecords, writeEmailTrajectoryEpisodes } from "../src/email/trajectory-import.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("email rl experiment config", () => {
  it("builds default comparison variants with imported episodes when a path is provided", () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaws-email-rl-default-variants-"));
    tempDirs.push(outputDir);
    const imported = importEmailTrajectoryRecords(
      [
        {
          episodeId: "variant-default-001",
          mode: "write",
          body: "Please send the pricing reply by Friday.",
          annotations: {
            actions: {
              ask: ["Send the pricing reply"],
              deadline: ["Friday"]
            }
          }
        }
      ],
      {
        profile: "generic"
      }
    );
    const episodesPath = writeEmailTrajectoryEpisodes(path.join(outputDir, "episodes.jsonl"), imported.episodes);

    const variants = buildDefaultEmailRlComparisonVariants({
      benchmarkIds: ["enronsr-reply-alignment"],
      trainingEpisodesPath: episodesPath
    });

    expect(variants.map((variant) => variant.variantId)).toEqual([
      "seed-default",
      "seed-tuned",
      "imported-default",
      "seed-plus-imported-default",
      "imported-tuned",
      "seed-plus-imported-tuned"
    ]);
    expect(variants[2]?.trainingEpisodes).toHaveLength(1);
    expect(variants[5]?.appendSeedEpisodes).toBe(true);
  });

  it("loads a manifest with relative episode paths and tuned presets", () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaws-email-rl-manifest-"));
    tempDirs.push(outputDir);

    const imported = importEmailTrajectoryRecords(
      [
        {
          episodeId: "manifest-import-001",
          mode: "write",
          body: "Please send the pricing reply by Friday and use the quote.",
          annotations: {
            actions: {
              ask: ["Send the pricing reply"],
              deadline: ["Friday"],
              artifact: ["quote"]
            }
          }
        }
      ],
      {
        profile: "generic"
      }
    );
    const episodesPath = writeEmailTrajectoryEpisodes(path.join(outputDir, "episodes.jsonl"), imported.episodes);
    const manifestPath = path.join(outputDir, "compare.json");
    fs.writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          generatedAt: "2026-04-21T12:00:00.000Z",
          benchmarkIds: ["enronsr-reply-alignment"],
          anchorVariantId: "seed-default",
          outputDir: "artifacts-out",
          variants: [
            {
              variantId: "seed-default",
              title: "Seed default"
            },
            {
              variantId: "imported-tuned",
              title: "Imported tuned",
              episodes: "./episodes.jsonl",
              preset: "tuned",
              appendSeedEpisodes: true
            }
          ]
        },
        null,
        2
      ),
      "utf8"
    );

    const manifest = loadEmailRlComparisonManifest(manifestPath);
    const tunedPreset = getEmailRlPolicyPreset("tuned");

    expect(manifest.anchorVariantId).toBe("seed-default");
    expect(manifest.outputDir).toBe(path.join(outputDir, "artifacts-out"));
    expect(manifest.variants).toHaveLength(2);
    expect(manifest.variants[1]?.trainingEpisodes).toHaveLength(1);
    expect(manifest.variants[1]?.appendSeedEpisodes).toBe(true);
    expect(manifest.variants[1]?.policyConfig).toEqual(tunedPreset.policyConfig);
    expect(manifest.variants[1]?.maxWriteFields).toBe(tunedPreset.maxWriteFields);
    expect(manifest.variants[1]?.benchmarkIds).toEqual(["enronsr-reply-alignment"]);
  });
});
