import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import { initializeDatabase } from "../src/storage/db.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("initializeDatabase", () => {
  it("creates the sqlite file, schema metadata, and a control-plane-only outbox schema", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaw.sqlite")
    });

    const handle = initializeDatabase(config);
    const row = handle.db.prepare("SELECT version FROM schema_meta WHERE id = 1").get() as {
      version: number;
    };

    expect(fs.existsSync(handle.path)).toBe(true);
    expect(row.version).toBe(31);
    expect(
      handle.db
        .prepare(
          `
            SELECT name
            FROM sqlite_master
            WHERE type = 'table' AND name = 'mail_outbox'
            LIMIT 1;
          `
        )
        .get()
    ).toBeUndefined();
    expect(
      handle.db
        .prepare(
          `
            SELECT name
            FROM sqlite_master
            WHERE type = 'table' AND name = 'outbox_intents'
            LIMIT 1;
          `
        )
        .get()
    ).toEqual({
      name: "outbox_intents"
    });
    expect(
      handle.db
        .prepare(
          `
            SELECT name
            FROM sqlite_master
            WHERE type = 'table' AND name = 'oauth_login_sessions'
            LIMIT 1;
          `
        )
        .get()
    ).toEqual({
      name: "oauth_login_sessions"
    });
    expect(
      handle.db
        .prepare(
          `
            SELECT name
            FROM pragma_table_info('virtual_messages')
            WHERE name = 'origin_kind'
            LIMIT 1;
          `
        )
        .get()
    ).toEqual({
      name: "origin_kind"
    });
    expect(
      handle.db
        .prepare(
          `
            SELECT name
            FROM pragma_table_info('task_nodes')
            WHERE name = 'task_class'
            LIMIT 1;
          `
        )
        .get()
    ).toEqual({
      name: "task_class"
    });

    handle.close();
  });

  it("reopens an already-initialized database while another handle is still active", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-db-reopen-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaw.sqlite")
    });

    const first = initializeDatabase(config);
    const second = initializeDatabase(config);
    const row = second.db.prepare("SELECT version FROM schema_meta WHERE id = 1").get() as {
      version: number;
    };

    expect(row.version).toBe(31);

    second.close();
    first.close();
  });
});
