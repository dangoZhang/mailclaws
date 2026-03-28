import { describe, expect, it } from "vitest";

import { evaluateLoopGuard } from "../src/security/loop-guard.js";

describe("evaluateLoopGuard", () => {
  it("blocks auto-generated messages and mailing list mail", () => {
    const result = evaluateLoopGuard({
      from: "robot@list.example",
      headers: {
        "Auto-Submitted": "auto-generated",
        "Precedence": "bulk",
        "List-Id": "<list.example>",
        "X-Auto-Response-Suppress": "All"
      }
    });

    expect(result.blocked).toBe(true);
    expect(result.reasons).toEqual(
      expect.arrayContaining(["auto-submitted:auto-generated", "precedence:bulk", "list-id", "x-auto-response-suppress:all"])
    );
  });

  it("blocks noreply style senders", () => {
    const result = evaluateLoopGuard({
      from: "noreply@service.example",
      headers: {}
    });

    expect(result.blocked).toBe(true);
    expect(result.reasons).toContain("from:noreply");
  });

  it("allows normal human mail", () => {
    const result = evaluateLoopGuard({
      from: "person@example.com",
      headers: {
        "Auto-Submitted": "no"
      }
    });

    expect(result.blocked).toBe(false);
    expect(result.reasons).toEqual([]);
  });
});
