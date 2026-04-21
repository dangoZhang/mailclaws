import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildEmailRlPresetComparisonVariants,
  buildDefaultEmailRlComparisonVariants,
  getEmailRlPolicyPreset,
  getEmailRlPolicyPresetPack,
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

  it("builds preset comparison variants for imported trajectories", () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaws-email-rl-preset-variants-"));
    tempDirs.push(outputDir);

    const imported = importEmailTrajectoryRecords(
      [
        {
          episodeId: "preset-variant-001",
          mode: "read",
          body: "Legal will review the draft tomorrow and confirm the owner.",
          annotations: {
            actions: {
              commitment: ["Legal will review the draft"],
              deadline: ["tomorrow"],
              stakeholder: ["Legal"]
            }
          }
        }
      ],
      {
        profile: "generic"
      }
    );
    const episodesPath = writeEmailTrajectoryEpisodes(path.join(outputDir, "episodes.jsonl"), imported.episodes);

    const variants = buildEmailRlPresetComparisonVariants({
      benchmarkIds: ["radar-action-items"],
      trainingEpisodesPath: episodesPath,
      appendSeedEpisodes: true,
      presetNames: ["conservative", "reply-heavy"]
    });

    expect(variants.map((variant) => variant.variantId)).toEqual([
      "seed-plus-imported-default",
      "seed-plus-imported-conservative",
      "seed-plus-imported-reply-heavy"
    ]);
    expect(variants[1]?.appendSeedEpisodes).toBe(true);
    expect(variants[2]?.trainingEpisodes).toHaveLength(1);
  });

  it("loads a manifest from a preset pack without explicit variants", () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaws-email-rl-preset-pack-"));
    tempDirs.push(outputDir);
    const manifestPath = path.join(outputDir, "compare.json");
    fs.writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          benchmarkIds: ["emailsum-thread-summarization", "bc3-thread-summary"],
          anchorVariantId: "seed-default",
          presetPack: "explain",
          outputDir: "artifacts-out"
        },
        null,
        2
      ),
      "utf8"
    );

    const manifest = loadEmailRlComparisonManifest(manifestPath);
    const explainPack = getEmailRlPolicyPresetPack("explain");

    expect(manifest.anchorVariantId).toBe("seed-default");
    expect(manifest.outputDir).toBe(path.join(outputDir, "artifacts-out"));
    expect(manifest.variants).toHaveLength(explainPack.length + 1);
    expect(manifest.variants.map((variant) => variant.variantId)).toEqual([
      "seed-default",
      ...explainPack.map((presetName) => `seed-${presetName}`)
    ]);
  });
});
