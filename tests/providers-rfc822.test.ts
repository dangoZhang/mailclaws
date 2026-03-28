import { describe, expect, it } from "vitest";

import { parseRawMimeEnvelope } from "../src/providers/rfc822.js";
import { createMailLab } from "./helpers/mail-lab.js";

describe("rfc822 provider adapter", () => {
  it("parses raw MIME into a provider envelope with attachments and fallback recipients", async () => {
    const lab = createMailLab("raw-ingress");
    const rawEnvelope = lab.newMail({
      subject: "Raw ingress message",
      text: "Hello from a forwarded raw MIME message.",
      to: [{ email: lab.addresses.assistant }],
      attachments: [
        {
          filename: "note.txt",
          mimeType: "text/plain",
          data: "Forwarded attachment content."
        }
      ]
    });

    const envelope = await parseRawMimeEnvelope({
      rawMime: rawEnvelope.rawMime ?? "",
      fallbackMailboxAddress: lab.addresses.assistant
    });

    expect(envelope).toMatchObject({
      messageId: rawEnvelope.messageId,
      subject: "Raw ingress message",
      from: {
        email: lab.addresses.customerA
      },
      to: expect.arrayContaining([
        expect.objectContaining({
          email: lab.addresses.assistant
        })
      ]),
      text: "Hello from a forwarded raw MIME message."
    });
    expect(envelope.providerMessageId).toMatch(/^raw:/);
    expect(envelope.envelopeRecipients).toContain(lab.addresses.assistant);
    expect(envelope.attachments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filename: "note.txt",
          mimeType: "text/plain"
        })
      ])
    );
    expect(envelope.headers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Message-ID",
          value: rawEnvelope.messageId
        })
      ])
    );
  });
});
