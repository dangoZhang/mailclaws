import { describe, expect, it } from "vitest";

import {
  buildReplyHeaders,
  buildThreadReplyPayload,
  composeAckReply,
  composeFinalReply,
  composeProgressReply,
  renderPreToMail
} from "../src/reporting/compose.js";
import { normalizeAndValidateOutboundHeaders } from "../src/reporting/rfc.js";

describe("reporting helpers", () => {
  const baseThread = {
    subject: "Re: Example thread",
    from: "MailClaws <mailclaws@example.com>",
    to: ["User <user@example.com>"],
    cc: ["Team <team@example.com>"],
    messageId: "<reply-1@example.com>",
    inReplyTo: "<message-0@example.com>",
    references: ["<message-0@example.com>", "<message-1@example.com>"]
  };

  it("builds reply headers with threaded metadata", () => {
    const headers = buildReplyHeaders(baseThread);

    expect(headers.Subject).toBe("Re: Example thread");
    expect(headers["In-Reply-To"]).toBe("<message-0@example.com>");
    expect(headers.References).toBe("<message-0@example.com> <message-1@example.com>");
    expect(headers["Auto-Submitted"]).toBe("auto-generated");
  });

  it("normalizes duplicate references when composing reply headers", () => {
    const headers = buildReplyHeaders({
      ...baseThread,
      references: [
        "<message-0@example.com>",
        " <message-1@example.com> ",
        "<message-0@example.com>",
        "<message-1@example.com>"
      ],
      inReplyTo: "<message-1@example.com>"
    });

    expect(headers.References).toBe("<message-0@example.com> <message-1@example.com>");
  });

  it("composes ack, progress, and final payloads", () => {
    expect(composeAckReply(baseThread, "Acknowledged")).toMatchObject({
      kind: "ack",
      body: "Acknowledged"
    });
    expect(composeProgressReply(baseThread, "Still working")).toMatchObject({
      kind: "progress",
      body: "Still working"
    });
    expect(composeFinalReply(baseThread, "Done")).toMatchObject({
      kind: "final",
      body: "Done"
    });
  });

  it("creates a thread reply payload ready for the outbox", () => {
    const payload = buildThreadReplyPayload(baseThread, "Done");

    expect(payload.headers.To).toBe("User <user@example.com>");
    expect(payload.headers.Cc).toBe("Team <team@example.com>");
    expect(payload.headers.Subject).toBe("Re: Example thread");
    expect(payload.body).toBe("Done");
  });

  it("renders mail directly from a pre packet and prefers draft body for display", () => {
    const payload = renderPreToMail(baseThread, {
      kind: "final",
      audience: "external",
      summary: "Short summary",
      draftBody: "Longer draft body",
      facts: [],
      openQuestions: [],
      decisions: [],
      commitments: [],
      requestedActions: [],
      roomRevision: 2,
      inputsHash: "hash-1",
      createdBy: {
        mailboxId: "public:assistant"
      }
    });

    expect(payload).toMatchObject({
      kind: "final",
      body: "Longer draft body"
    });
    expect(payload.headers.Subject).toBe("Re: Example thread");
  });

  it("rejects duplicate case-variant singleton headers and header CRLF injection", () => {
    expect(() =>
      normalizeAndValidateOutboundHeaders({
        "Message-ID": "<one@example.com>",
        "message-id": "<two@example.com>"
      })
    ).toThrow(/duplicate single-instance header/i);

    expect(() =>
      normalizeAndValidateOutboundHeaders({
        Subject: "Hello\r\nBcc: attacker@example.com"
      })
    ).toThrow(/must not contain CRLF/i);
  });
});
