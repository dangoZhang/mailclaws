import { describe, expect, it } from "vitest";

import { buildRoomSessionKey, buildWorkerSessionKey } from "../src/threading/session-key.js";

describe("session key builders", () => {
  it("builds stable room session keys", () => {
    expect(buildRoomSessionKey("acct-1", "thread-42")).toBe("hook:mail:acct-1:thread:thread-42");
  });

  it("builds stable worker session keys under the same room", () => {
    expect(buildWorkerSessionKey("acct-1", "thread-42", "mail-researcher")).toBe(
      "hook:mail:acct-1:thread:thread-42:agent:mail-researcher"
    );
  });

  it("scopes room and worker session keys to the front public agent when provided", () => {
    expect(buildRoomSessionKey("acct-1", "thread-42", "hook:mail", "Research@AI.Example.com")).toBe(
      "hook:mail:acct-1:front:research%40ai.example.com:thread:thread-42"
    );
    expect(
      buildWorkerSessionKey(
        "acct-1",
        "thread-42",
        "mail-researcher",
        "hook:mail",
        "Research@AI.Example.com"
      )
    ).toBe("hook:mail:acct-1:front:research%40ai.example.com:thread:thread-42:agent:mail-researcher");
  });
});
