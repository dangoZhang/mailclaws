import { describe, expect, it } from "vitest";

import { evaluateSenderPolicy } from "../src/security/sender-policy.js";

describe("evaluateSenderPolicy", () => {
  it("allows explicitly permitted senders", () => {
    const result = evaluateSenderPolicy({
      from: "alice@example.com",
      config: {
        allowEmails: ["alice@example.com"],
        denyEmails: ["blocked@example.com"]
      }
    });

    expect(result.allowed).toBe(true);
    expect(result.reason).toContain("allowlist");
  });

  it("denies blocked domains even when the sender otherwise matches an allowlist", () => {
    const result = evaluateSenderPolicy({
      from: "alice@evil.example",
      config: {
        allowDomains: ["evil.example"],
        denyDomains: ["evil.example"]
      }
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("deny");
  });

  it("defaults to deny when an allowlist exists and the sender does not match it", () => {
    const result = evaluateSenderPolicy({
      from: "alice@other.example",
      config: {
        allowDomains: ["example.com"]
      }
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("allowlist");
  });
});
