import { describe, expect, it } from "vitest";

import {
  normalizeMailEnvelope,
  normalizeText,
  stripHtml,
  stripQuotedText
} from "../src/providers/index.js";

describe("normalizeText", () => {
  it("normalizes line endings and trims redundant blank lines", () => {
    expect(normalizeText("Hello\r\n\r\nWorld \n\n")).toBe("Hello\nWorld");
  });

  it("strips common quoted-reply blocks and signatures", () => {
    expect(
      normalizeText(
        [
          "Thanks for the update.",
          "",
          "On Tue, Mar 25, 2026 at 10:00 AM Someone <person@example.com> wrote:",
          "> Prior message",
          "",
          "-- ",
          "Sender Signature"
        ].join("\n")
      )
    ).toBe("Thanks for the update.");
  });
});

describe("stripQuotedText", () => {
  it("cuts quoted lines and forwarded content markers", () => {
    expect(
      stripQuotedText(
        [
          "Latest response",
          "",
          "> older text",
          "> older text 2",
          "",
          "From: somebody@example.com",
          "Sent: Tuesday"
        ].join("\n")
      )
    ).toBe("Latest response");
  });
});

describe("stripHtml", () => {
  it("strips markup and decodes common entities", () => {
    expect(stripHtml("<div>Hello&nbsp;<strong>world</strong></div><script>alert(1)</script>")).toBe(
      "Hello world"
    );
  });
});

describe("normalizeMailEnvelope", () => {
  it("normalizes provider mail metadata and fallback message id", () => {
    const normalized = normalizeMailEnvelope({
      providerMessageId: "provider-123",
      subject: "  Re: Hello   world ",
      from: { email: "SENDER@Example.COM", name: " Sender " },
      to: [{ email: "recipient@example.com" }],
      cc: [{ email: "CC@example.com" }],
      replyTo: [{ email: "Reply@example.com" }],
      date: "2026-03-25T01:02:03Z",
      headers: [{ name: "X-Test", value: " one   two " }],
      html: "<p>Hello <em>world</em></p>",
      attachments: [{ filename: "  report.pdf ", mimeType: "application/pdf", size: 12 }],
      raw: { source: "mail" }
    });

    expect(normalized.messageId).toBe("<mailclaws-provider-123>");
    expect(normalized.subject).toBe("Re: Hello   world");
    expect(normalized.from).toEqual({ name: "Sender", email: "sender@example.com" });
    expect(normalized.text).toBe("Hello world");
    expect(normalized.headers).toEqual([{ name: "X-Test", value: "one two" }]);
    expect(normalized.attachments).toEqual([
      { filename: "report.pdf", mimeType: "application/pdf", size: 12, contentId: undefined, disposition: undefined }
    ]);
    expect(normalized.raw).toEqual({ source: "mail" });
  });
});
