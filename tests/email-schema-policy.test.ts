import { describe, expect, it } from "vitest";

import { buildEmailSemanticPacket, formatEmailSemanticPacket } from "../src/email/schema-policy.js";

describe("email schema policy", () => {
  it("retains email-specific fields with rationales for write prompts", () => {
    const packet = buildEmailSemanticPacket({
      mode: "write",
      from: "buyer@example.com",
      to: ["frontdesk@mailclaws.test", "sales@example.com"],
      cc: ["security@example.com"],
      subject: "Pilot pricing and security follow-up",
      body:
        "Please send one customer-ready reply with the pilot pricing and current SSO status by Friday. Keep it concise and avoid internal process notes.",
      attachments: [
        {
          filename: "pricing.md",
          summaryText: "Pilot starts at $12k and includes audit logs."
        }
      ]
    });

    expect(packet.fields.map((field) => field.key)).toEqual(
      expect.arrayContaining(["ask", "deadline", "artifact", "constraint"])
    );
    expect(packet.fields.every((field) => field.rationale.length > 0)).toBe(true);
    expect(formatEmailSemanticPacket(packet)).toContain("[why:");
  });
});
