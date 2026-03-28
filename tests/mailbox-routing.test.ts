import { describe, expect, it } from "vitest";

import type { NormalizedMailEnvelope } from "../src/providers/types.js";
import { filterInternalAliasRecipients, resolveMailboxRoute } from "../src/threading/mailbox-routing.js";

function buildEnvelope(overrides: Partial<NormalizedMailEnvelope> = {}): NormalizedMailEnvelope {
  return {
    providerMessageId: "provider-1",
    messageId: "<msg-1@example.com>",
    threadId: undefined,
    envelopeRecipients: [],
    subject: "Routing",
    from: {
      email: "sender@example.com"
    },
    to: [
      {
        email: "assistant@ai.example.com"
      }
    ],
    cc: [],
    bcc: [],
    replyTo: [],
    date: "2026-03-25T00:00:00.000Z",
    headers: [],
    text: "Hello",
    html: undefined,
    attachments: [],
    raw: {},
    ...overrides
  };
}

describe("mailbox routing", () => {
  it("preserves public agent selection order and keeps plus-addresses as inbound hints only", () => {
    const route = resolveMailboxRoute({
      account: {
        accountId: "acct-1",
        provider: "imap",
        emailAddress: "assistant@ai.example.com",
        status: "active",
        settings: {
          routing: {
            publicAliases: [
              "assistant@ai.example.com",
              "research@ai.example.com",
              "ops@ai.example.com"
            ],
            plusRoleAliases: {
              review: "mail-reviewer"
            }
          }
        },
        createdAt: "2026-03-25T00:00:00.000Z",
        updatedAt: "2026-03-25T00:00:00.000Z"
      },
      fallbackMailboxAddress: "assistant@ai.example.com",
      envelope: buildEnvelope({
        to: [
          {
            email: "assistant+review@ai.example.com"
          },
          {
            email: "ops@ai.example.com"
          }
        ],
        cc: [
          {
            email: "research@ai.example.com"
          }
        ],
        headers: [
          {
            name: "Delivered-To",
            value: "<assistant+review@ai.example.com>"
          }
        ]
      })
    });

    expect(route.frontAgentAddress).toBe("ops@ai.example.com");
    expect(route.canonicalMailboxAddress).toBe("ops@ai.example.com");
    expect(route.publicAgentAddresses).toEqual([
      "ops@ai.example.com",
      "research@ai.example.com",
      "assistant@ai.example.com"
    ]);
    expect(route.collaboratorAgentAddresses).toEqual([
      "research@ai.example.com"
    ]);
    expect(route.summonedRoles).toEqual(["mail-reviewer"]);
    expect(route.internalAliasAddresses).toContain("assistant+review@ai.example.com");
  });

  it("prioritizes routed aliases and keeps plus-address summons on the canonical mailbox", () => {
    const route = resolveMailboxRoute({
      account: {
        accountId: "acct-1",
        provider: "imap",
        emailAddress: "assistant@ai.example.com",
        status: "active",
        settings: {
          routing: {
            publicAliases: ["research@ai.example.com"],
            plusRoleAliases: {
              review: "mail-reviewer"
            }
          }
        },
        createdAt: "2026-03-25T00:00:00.000Z",
        updatedAt: "2026-03-25T00:00:00.000Z"
      },
      fallbackMailboxAddress: "assistant@ai.example.com",
      envelope: buildEnvelope({
        envelopeRecipients: ["research@ai.example.com"],
        headers: [
          {
            name: "Delivered-To",
            value: "<assistant+review@ai.example.com>"
          }
        ]
      })
    });

    expect(route.canonicalMailboxAddress).toBe("research@ai.example.com");
    expect(route.frontAgentAddress).toBe("research@ai.example.com");
    expect(route.collaboratorAgentAddresses).toEqual([]);
    expect(route.publicAgentAddresses).toEqual(["research@ai.example.com", "assistant@ai.example.com"]);
    expect(route.summonedRoles).toEqual(["mail-reviewer"]);
    expect(route.internalAliasAddresses).toContain("assistant+review@ai.example.com");
  });

  it("tracks additional public agent aliases as collaborator agents", () => {
    const route = resolveMailboxRoute({
      account: {
        accountId: "acct-1",
        provider: "imap",
        emailAddress: "assistant@ai.example.com",
        status: "active",
        settings: {
          routing: {
            publicAliases: ["research@ai.example.com", "ops@ai.example.com"]
          }
        },
        createdAt: "2026-03-25T00:00:00.000Z",
        updatedAt: "2026-03-25T00:00:00.000Z"
      },
      fallbackMailboxAddress: "assistant@ai.example.com",
      envelope: buildEnvelope({
        to: [{ email: "assistant@ai.example.com" }],
        cc: [{ email: "research@ai.example.com" }, { email: "ops@ai.example.com" }]
      })
    });

    expect(route.canonicalMailboxAddress).toBe("assistant@ai.example.com");
    expect(route.collaboratorAgentAddresses).toEqual([
      "research@ai.example.com",
      "ops@ai.example.com"
    ]);
  });

  it("filters same-domain worker aliases from outbound recipients", () => {
    const recipients = filterInternalAliasRecipients(
      [
        "assistant@ai.example.com",
        "assistant+research@ai.example.com",
        "review@ai.example.com",
        "alice@ai.example.com",
        "bob@example.com"
      ],
      "assistant@ai.example.com"
    );

    expect(recipients).toEqual(["alice@ai.example.com", "bob@example.com"]);
  });
});
