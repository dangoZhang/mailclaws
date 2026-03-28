import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import { initializeDatabase } from "../src/storage/db.js";
import {
  getMailAccount,
  listMailAccounts,
  upsertMailAccount
} from "../src/storage/repositories/mail-accounts.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("mail account repository", () => {
  it("stores and lists account metadata", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-accounts-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaw.sqlite")
    });
    const handle = initializeDatabase(config);

    upsertMailAccount(handle.db, {
      accountId: "acct-1",
      provider: "imap",
      emailAddress: "mailclaw@example.com",
      displayName: "MailClaw",
      status: "active",
      settings: {
        host: "imap.example.com"
      },
      createdAt: "2026-03-25T05:00:00.000Z",
      updatedAt: "2026-03-25T05:00:00.000Z"
    });

    const account = getMailAccount(handle.db, "acct-1");
    const accounts = listMailAccounts(handle.db);

    expect(account).toMatchObject({
      accountId: "acct-1",
      provider: "imap",
      emailAddress: "mailclaw@example.com"
    });
    expect(accounts).toHaveLength(1);
    expect(accounts[0]?.settings).toMatchObject({
      host: "imap.example.com"
    });

    handle.close();
  });
});
