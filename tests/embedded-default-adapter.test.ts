import fs from "node:fs";
import os from "node:os";
import path from "node:path";

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

    expect(result.responseText).toBe("What is MailClaws in one sentence?");
  });

  it("extracts readable facts from text attachments", async () => {
    const adapter = createBuiltInEmbeddedRuntimeAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaws-embedded-attachments-"));
    const extractedTextPath = path.join(tempDir, "pricing.md");
    fs.writeFileSync(extractedTextPath, "Pricing: pilot starts at $12k.\nSecurity: requires SSO.", "utf8");

    const result = await adapter.executeMailTurn({
      sessionKey: "hook:mail:acct:thread:attachment-room",
      inputText: [
        "Default mail skills for attachment-reader:",
        "Role: mail-attachment-reader",
        "Subject: Pricing and security",
        "Summarize the most relevant attachment evidence for the current reply."
      ].join("\n"),
      agentId: "mail-attachment-reader",
      attachments: [
        {
          attachmentId: "att-1",
          filename: "pricing.txt",
          mimeType: "text/plain",
          artifactPath: path.join(tempDir, "metadata.json"),
          extractedTextPath
        }
      ],
      history: [],
      session: {
        sessionId: "session-2",
        statePath: "/tmp/state",
        transcriptPath: "/tmp/transcript"
      }
    });

    const parsed = JSON.parse(result.responseText) as {
      summary: string;
      facts: Array<{ claim: string }>;
    };

    expect(parsed.summary).toContain("extracted");
    expect(parsed.facts.map((entry) => entry.claim)).toEqual(
      expect.arrayContaining(["Pricing: pilot starts at $12k.", "Security: requires SSO."])
    );

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("uses attachment facts when composing the embedded orchestrator reply", async () => {
    const adapter = createBuiltInEmbeddedRuntimeAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaws-embedded-reply-"));
    const extractedTextPath = path.join(tempDir, "facts.md");
    fs.writeFileSync(
      extractedTextPath,
      "Pricing: pilot starts at $12k.\nSecurity: requires SSO, audit logs, and review.",
      "utf8"
    );

    const result = await adapter.executeMailTurn({
      sessionKey: "hook:mail:acct:thread:reply-room",
      inputText: [
        "Default mail skills for front-orchestrator:",
        "From: customer@example.com",
        "Subject: Need pricing and security reply",
        "Current inbound body:",
        "Please send one concise combined reply.",
        "",
        "Worker summaries:",
        "- mail-attachment-reader: Read the attachments."
      ].join("\n"),
      agentId: "mail-orchestrator",
      attachments: [
        {
          attachmentId: "att-1",
          filename: "brief.txt",
          mimeType: "text/plain",
          artifactPath: path.join(tempDir, "metadata.json"),
          extractedTextPath
        }
      ],
      history: [],
      session: {
        sessionId: "session-3",
        statePath: "/tmp/state",
        transcriptPath: "/tmp/transcript"
      }
    });

    expect(result.responseText).toContain("Pricing: pilot starts at $12k.");
    expect(result.responseText).toContain("Security: requires SSO, audit logs, and review.");

    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});
