import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import { initializeDatabase } from "../src/storage/db.js";
import { resolveThreadForMail } from "../src/threading/thread-resolver.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

function createDb() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaws-thread-"));
  tempDirs.push(tempDir);

  const config = loadConfig({
    MAILCLAW_STATE_DIR: tempDir,
    MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaws.sqlite")
  });

  return initializeDatabase(config);
}

describe("resolveThreadForMail", () => {
  it("treats provider thread ids as hints and opens a new room without reply evidence", () => {
    const handle = createDb();

    const first = resolveThreadForMail(handle.db, {
      accountId: "acct-1",
      providerMessageId: "provider-1",
      providerThreadId: "gmail-123",
      messageId: "<msg-1@example.com>",
      subject: "Project update",
      normalizedText: "Hello",
      participants: ["sender@example.com", "team@example.com"],
      receivedAt: "2026-03-25T01:00:00.000Z"
    });
    const second = resolveThreadForMail(handle.db, {
      accountId: "acct-1",
      providerMessageId: "provider-2",
      providerThreadId: "gmail-123",
      messageId: "<msg-2@example.com>",
      subject: "Re: Project update",
      normalizedText: "Follow-up",
      participants: ["sender@example.com", "team@example.com"],
      receivedAt: "2026-03-25T02:00:00.000Z"
    });

    expect(first.source).toBe("new_thread");
    expect(second.stableThreadId).not.toBe(first.stableThreadId);
    expect(second.source).toBe("new_thread");

    handle.close();
  });

  it("links replies by In-Reply-To and References", () => {
    const handle = createDb();

    const root = resolveThreadForMail(handle.db, {
      accountId: "acct-1",
      providerMessageId: "provider-root",
      messageId: "<msg-root@example.com>",
      subject: "Roadmap review",
      normalizedText: "Root",
      participants: ["lead@example.com", "team@example.com"],
      receivedAt: "2026-03-25T01:00:00.000Z"
    });
    const reply = resolveThreadForMail(handle.db, {
      accountId: "acct-1",
      providerMessageId: "provider-reply",
      messageId: "<msg-reply@example.com>",
      inReplyTo: "<msg-root@example.com>",
      references: ["<msg-root@example.com>"],
      subject: "Re: Roadmap review",
      normalizedText: "Reply",
      participants: ["lead@example.com", "team@example.com"],
      receivedAt: "2026-03-25T02:00:00.000Z"
    });

    expect(reply.stableThreadId).toBe(root.stableThreadId);
    expect(reply.source).toBe("in_reply_to");

    handle.close();
  });

  it("opens a new room when there is no reply relation even if subject and participants match", () => {
    const handle = createDb();

    const root = resolveThreadForMail(handle.db, {
      accountId: "acct-1",
      providerMessageId: "provider-root",
      messageId: "<msg-root@example.com>",
      subject: "Re: Weekly sync",
      normalizedText: "Root",
      participants: ["lead@example.com", "team@example.com"],
      receivedAt: "2026-03-25T01:00:00.000Z"
    });
    const followUp = resolveThreadForMail(handle.db, {
      accountId: "acct-1",
      providerMessageId: "provider-follow-up",
      messageId: "<msg-follow-up@example.com>",
      subject: "Weekly sync",
      normalizedText: "No refs",
      participants: ["team@example.com", "lead@example.com"],
      receivedAt: "2026-03-26T01:00:00.000Z"
    });

    expect(followUp.stableThreadId).not.toBe(root.stableThreadId);
    expect(followUp.source).toBe("new_thread");

    handle.close();
  });

  it("marks duplicate inbound mail without creating a new thread", () => {
    const handle = createDb();

    const first = resolveThreadForMail(handle.db, {
      accountId: "acct-1",
      providerMessageId: "provider-1",
      messageId: "<msg-dup@example.com>",
      subject: "Duplicate",
      normalizedText: "Same",
      participants: ["lead@example.com", "team@example.com"],
      receivedAt: "2026-03-25T01:00:00.000Z"
    });
    const duplicate = resolveThreadForMail(handle.db, {
      accountId: "acct-1",
      providerMessageId: "provider-1",
      messageId: "<msg-dup@example.com>",
      subject: "Duplicate",
      normalizedText: "Same",
      participants: ["lead@example.com", "team@example.com"],
      receivedAt: "2026-03-25T01:00:01.000Z"
    });

    expect(duplicate.isDuplicate).toBe(true);
    expect(duplicate.stableThreadId).toBe(first.stableThreadId);
    expect(duplicate.source).toBe("duplicate");

    handle.close();
  });

  it("derives new thread ids deterministically from the root message id", () => {
    const firstHandle = createDb();
    const secondHandle = createDb();

    const first = resolveThreadForMail(firstHandle.db, {
      accountId: "acct-1",
      providerMessageId: "provider-root-1",
      messageId: "<msg-root-deterministic@example.com>",
      subject: "Deterministic root",
      normalizedText: "Root",
      participants: ["lead@example.com", "team@example.com"],
      receivedAt: "2026-03-25T01:00:00.000Z"
    });
    const second = resolveThreadForMail(secondHandle.db, {
      accountId: "acct-1",
      providerMessageId: "provider-root-2",
      messageId: "<msg-root-deterministic@example.com>",
      subject: "Deterministic root",
      normalizedText: "Root",
      participants: ["lead@example.com", "team@example.com"],
      receivedAt: "2026-03-25T01:00:00.000Z"
    });

    expect(first.stableThreadId).toBe(second.stableThreadId);
    expect(first.stableThreadId).toMatch(/^thread-[a-f0-9]{16}$/);

    firstHandle.close();
    secondHandle.close();
  });
});
