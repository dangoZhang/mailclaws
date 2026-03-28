import { describe, expect, it } from "vitest";

import { MemoryOutboxAdapter } from "../src/providers/index.js";

describe("MemoryOutboxAdapter", () => {
  it("records skipped intents when disabled", () => {
    const adapter = new MemoryOutboxAdapter();
    const record = adapter.enqueue({
      threadKey: "hook:mail:acct:thread:abc",
      to: [{ email: "user@example.com" }],
      subject: "Reply",
      text: "Hello"
    });

    expect(record.provider).toBe("smtp");
    expect(record.enabled).toBe(false);
    expect(record.status).toBe("skipped");
    expect(record.error).toBe("smtp outbox is disabled");
    expect(adapter.get(record.intentId)).toEqual(record);
  });

  it("tracks intent state transitions when enabled", () => {
    const adapter = new MemoryOutboxAdapter({ enabled: true });
    const record = adapter.enqueue({
      threadKey: "hook:mail:acct:thread:abc",
      to: [{ email: "user@example.com" }],
      cc: [{ email: "cc@example.com" }],
      subject: "Reply",
      text: "Hello",
      headers: [{ name: "X-Trace", value: "1" }]
    });

    expect(record.status).toBe("queued");
    expect(adapter.markSending(record.intentId).status).toBe("sending");
    expect(adapter.markSent(record.intentId).status).toBe("sent");
  });
});
