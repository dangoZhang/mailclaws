import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { loadEmailRlComparisonManifest } from "../src/benchmarks/email-rl-experiment-config.js";

describe("email rl experiment manifests", () => {
  it("loads all committed experiment manifests", () => {
    const manifestDir = path.resolve("experiments", "email-rl");
    const manifestFiles = fs
      .readdirSync(manifestDir)
      .filter((entry) => entry.endsWith(".json"))
      .sort((left, right) => left.localeCompare(right));

    expect(manifestFiles.length).toBeGreaterThan(0);

    for (const manifestFile of manifestFiles) {
      const manifest = loadEmailRlComparisonManifest(path.join(manifestDir, manifestFile));
      expect(manifest.variants.length).toBeGreaterThan(0);
      expect(manifest.anchorVariantId).toBe("seed-default");
    }
  });
});
