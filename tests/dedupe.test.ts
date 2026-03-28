import { describe, expect, it } from "vitest";

import { buildInboundDedupKey } from "../src/threading/dedupe.js";

describe("buildInboundDedupKey", () => {
  it("prefers provider message ids when available", () => {
    const key = buildInboundDedupKey({
      accountId: "acct-1",
      providerMessageId: "provider-123",
      messageId: "<internet@example.com>",
      normalizedSubject: "Quarterly update",
      normalizedText: "Hello",
      participants: ["a@example.com", "b@example.com"]
    });

    expect(key).toBe("acct-1:provider:provider-123");
  });

  it("falls back to a deterministic content hash", () => {
    const first = buildInboundDedupKey({
      accountId: "acct-1",
      messageId: "",
      normalizedSubject: "Quarterly update",
      normalizedText: "Hello",
      participants: ["a@example.com", "b@example.com"]
    });
    const second = buildInboundDedupKey({
      accountId: "acct-1",
      messageId: "",
      normalizedSubject: "Quarterly update",
      normalizedText: "Hello",
      participants: ["b@example.com", "a@example.com"]
    });

    expect(first).toBe(second);
    expect(first.startsWith("acct-1:hash:")).toBe(true);
  });
});
