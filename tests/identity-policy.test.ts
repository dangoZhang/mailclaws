import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import { ingestIncomingMail } from "../src/orchestration/service.js";
import { initializeDatabase } from "../src/storage/db.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("identity trust gate", () => {
  it("blocks inbound mail below the configured minimum trust level", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaws-trust-gate-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaws.sqlite"),
      MAILCLAW_FEATURE_MAIL_INGEST: "true",
      MAILCLAW_FEATURE_IDENTITY_TRUST_GATE: "true",
      MAILCLAW_IDENTITY_MIN_TRUST_LEVEL: "T2"
    });
    const handle = initializeDatabase(config);

    const result = ingestIncomingMail(
      {
        db: handle.db,
        config
      },
      {
        accountId: "acct-1",
        mailboxAddress: "mailclaws@example.com",
        envelope: {
          providerMessageId: "provider-1",
          messageId: "<msg-1@example.com>",
          subject: "Low trust",
          from: {
            email: "alice@example.com"
          },
          to: [{ email: "mailclaws@example.com" }],
          headers: [
            {
              name: "Message-ID",
              value: "<msg-1@example.com>"
            }
          ],
          text: "Hello"
        }
      }
    );

    expect(result.status).toBe("blocked");
    expect(result.reasons).toContain("identity_policy:minimum_trust:T2");

    handle.close();
  });

  it("allows inbound mail that meets the configured minimum trust level", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaws-trust-gate-pass-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaws.sqlite"),
      MAILCLAW_FEATURE_MAIL_INGEST: "true",
      MAILCLAW_FEATURE_IDENTITY_TRUST_GATE: "true",
      MAILCLAW_IDENTITY_MIN_TRUST_LEVEL: "T2"
    });
    const handle = initializeDatabase(config);

    const result = ingestIncomingMail(
      {
        db: handle.db,
        config
      },
      {
        accountId: "acct-1",
        mailboxAddress: "mailclaws@example.com",
        envelope: {
          providerMessageId: "provider-1",
          messageId: "<msg-2@example.com>",
          subject: "Aligned trust",
          from: {
            email: "alice@example.com"
          },
          to: [{ email: "mailclaws@example.com" }],
          replyTo: [{ email: "alice@example.com" }],
          headers: [
            {
              name: "Message-ID",
              value: "<msg-2@example.com>"
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

    expect(result.status).toBe("queued");

    handle.close();
  });
});
