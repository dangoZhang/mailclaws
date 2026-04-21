import { describe, expect, it } from "vitest";

import { rankEmailActions } from "../src/email/offline-rl.js";
import { builtInOfflineEmailPolicy } from "../src/email/schema-policy.js";

describe("email offline rl", () => {
  it("prioritizes deadline and artifact retention for write states with attachments", () => {
    const ranked = rankEmailActions(
      builtInOfflineEmailPolicy,
      {
        mode: "write",
        hasExplicitAsk: true,
        hasQuestion: true,
        hasDeadline: true,
        hasDecision: false,
        hasCommitment: false,
        hasAttachments: true,
        hasConstraints: true,
        hasRisks: false,
        multiPartyThread: true,
        hasOpenQuestions: true
      },
      ["ask", "deadline", "artifact", "reply_style", "stakeholder"]
    );

    expect(ranked.slice(0, 3).map((entry) => entry.action)).toEqual(["ask", "deadline", "artifact"]);
    expect(ranked[0]?.rationale).toContain("write");
  });

  it("falls back to similar-state priors when the exact state is missing", () => {
    const ranked = rankEmailActions(
      builtInOfflineEmailPolicy,
      {
        mode: "explain",
        hasExplicitAsk: false,
        hasQuestion: true,
        hasDeadline: false,
        hasDecision: true,
        hasCommitment: true,
        hasAttachments: false,
        hasConstraints: false,
        hasRisks: true,
        multiPartyThread: true,
        hasOpenQuestions: true
      },
      ["decision", "commitment", "risk", "reply_style"]
    );

    expect(ranked[0]?.provenance).not.toBe("global");
    expect(ranked[0]?.action).toMatch(/decision|commitment|risk/);
  });
});
