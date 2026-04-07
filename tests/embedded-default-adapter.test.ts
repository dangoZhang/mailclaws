import { describe, expect, it } from "vitest";

import { createBuiltInEmbeddedRuntimeAdapter } from "../src/runtime/embedded-default-adapter.js";

describe("embedded default adapter", () => {
  it("extracts body text when routing context is appended", async () => {
    const adapter = createBuiltInEmbeddedRuntimeAdapter();
    const inputText = [
      "Default mail skills for front-orchestrator:",
      "- Read Email: read the latest inbound first, then pull older room context only by reference.",
      "- Write Email: preserve ACK/progress/final semantics.",
      "From: friend@example.com",
      "Subject: Quick question 2026",
      "What is MailClaws in one sentence?",
      "Routing context:",
      "- Front agent: assistant",
      "- Front mailbox identity: demo.user@qq.com",
      "",
      "Worker summaries:",
      "- mail-researcher: Captured the current request context."
    ].join("\n");

    const result = await adapter.executeMailTurn({
      sessionKey: "hook:mail:acct:thread:abc",
      inputText,
      agentId: "mail-orchestrator",
      history: [],
      session: {
        sessionId: "session-1",
        statePath: "/tmp/state",
        transcriptPath: "/tmp/transcript"
      }
    });

    expect(result.responseText).toContain('Summary: What is MailClaws in one sentence?');
  });
});
