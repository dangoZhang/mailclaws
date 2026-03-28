import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import { ingestIncomingMail } from "../src/orchestration/service.js";
import { initializeDatabase } from "../src/storage/db.js";
import { findMailMessageByDedupeKey } from "../src/storage/repositories/mail-messages.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("identity in ingest", () => {
  it("persists trust metadata with the normalized mail", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-identity-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaw.sqlite"),
      MAILCLAW_FEATURE_MAIL_INGEST: "true"
    });
    const handle = initializeDatabase(config);

    const result = ingestIncomingMail(
      {
        db: handle.db,
        config
      },
      {
        accountId: "acct-1",
        mailboxAddress: "mailclaw@example.com",
        envelope: {
          providerMessageId: "provider-1",
          messageId: "<msg-1@example.com>",
          subject: "Identity",
          from: {
            email: "alice@example.com"
          },
          to: [{ email: "mailclaw@example.com" }],
          replyTo: [{ email: "alice@example.com" }],
          headers: [
            {
              name: "Message-ID",
              value: "<msg-1@example.com>"
            },
            {
              name: "Authentication-Results",
              value:
                "mx.example; spf=pass smtp.mailfrom=example.com; dkim=pass header.d=example.com; dmarc=pass header.from=example.com"
            }
          ],
          text: "Hello"
        }
      }
    );

    const message = findMailMessageByDedupeKey(handle.db, result.dedupeKey);

    expect(message?.trustLevel).toBe("T2");
    expect(message?.canonicalUserId).toBe("email:alice@example.com");
    expect(message?.identity?.authenticated).toBe(true);

    handle.close();
  });
});
