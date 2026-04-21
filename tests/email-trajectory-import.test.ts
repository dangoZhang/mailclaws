import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runEmailRlBenchmark } from "../src/benchmarks/email-rl.js";
import {
  importEmailTrajectoryRecords,
  loadEmailTrajectoryEpisodes,
  writeEmailTrajectoryEpisodes
} from "../src/email/trajectory-import.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("email trajectory import", () => {
  it("imports generic action annotations into trajectory episodes", () => {
    const result = importEmailTrajectoryRecords(
      [
        {
          episodeId: "generic-write-001",
          mode: "write",
          from: "buyer@example.com",
          to: ["frontdesk@mailclaws.test"],
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
    );

    expect(result.importedRecordCount).toBe(1);
    expect(result.episodes[0]?.steps.map((step) => step.action)).toEqual(
      expect.arrayContaining(["ask", "artifact", "deadline"])
    );
    expect(result.datasetIds).toEqual(["external-email"]);
  });

  it("maps RADAR-style action items into commitment-focused training signals", () => {
    const result = importEmailTrajectoryRecords(
      [
        {
          threadId: "radar-001",
          subject: "Customer follow-up owners",
          body: "Alex will send the revised proposal tomorrow and Priya will confirm the next meeting slot.",
          annotations: {
            actionItems: [
              {
                owner: "Alex",
                action: "Send the revised proposal",
                dueAt: "tomorrow"
              },
              {
                owner: "Priya",
                action: "Confirm the next meeting slot"
              }
            ]
          }
        }
      ],
      {
        profile: "radar-action-items"
      }
    );

    expect(result.importedRecordCount).toBe(1);
    expect(result.episodes[0]?.datasetId).toBe("radar-action-items");
    expect(result.episodes[0]?.steps.map((step) => step.action)).toEqual(
      expect.arrayContaining(["commitment", "next_action", "stakeholder", "deadline"])
    );
  });

  it("round-trips imported episodes and uses them as benchmark training input", async () => {
    const importResult = importEmailTrajectoryRecords(
      [
        {
          threadId: "emailsum-001",
          subject: "Budget approval and next step",
          body: "We approved the budget. Finance still needs the owner and the go-live date by May 1.",
          annotations: {
            summary: "Budget approved; finance needs the final owner and date.",
            decisions: ["Budget approved"],
            requestedActions: ["Name the final owner and confirm the date"],
            deadlines: ["May 1"]
          }
        }
      ],
      {
        profile: "emailsum"
      }
    );

    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaws-email-import-"));
    tempDirs.push(outputDir);
    const outputPath = writeEmailTrajectoryEpisodes(path.join(outputDir, "episodes.jsonl"), importResult.episodes);
    const loadedEpisodes = loadEmailTrajectoryEpisodes(outputPath);
    const benchmark = await runEmailRlBenchmark({
      benchmarkIds: ["bc3-thread-summary"],
      trainingEpisodes: loadedEpisodes
    });

    expect(loadedEpisodes).toHaveLength(1);
    expect(benchmark.trainingEpisodeCount).toBe(1);
    expect(benchmark.trainingDatasetIds).toEqual(["emailsum"]);
    expect(benchmark.rlPolicy.averageReward).toBeGreaterThan(0);
  });
});
