import { describe, expect, it, vi } from "vitest";

import { loadConfig } from "../src/config.js";
import {
  createAccountSmtpSender,
  createConfiguredSmtpSender,
  createSmtpTransportSender
} from "../src/providers/smtp.js";
import type { SmtpMessage } from "../src/providers/smtp.js";

describe("smtp transport sender", () => {
  it("maps a MailClaws outbox message into a nodemailer sendMail call", async () => {
    const sendMail = vi.fn(async () => ({
      messageId: "<smtp-1@example.com>"
    }));
    const sender = createSmtpTransportSender(
      {
        from: "mailclaws@example.com",
        host: "smtp.example.com",
        port: 587,
        secure: false
      },
      () => ({
        sendMail
      })
    );

    const result = await sender.send({
      outboxId: "outbox-1",
      to: ["a@example.com"],
      cc: ["c@example.com"],
      bcc: ["b@example.com"],
      subject: "Hello",
      textBody: "Hello body",
      htmlBody: "<p>Hello body</p>",
      headers: {
        "In-Reply-To": "<msg@example.com>"
      }
    });

    expect(sendMail).toHaveBeenCalledWith({
      from: "mailclaws@example.com",
      to: "a@example.com",
      cc: "c@example.com",
      bcc: "b@example.com",
      subject: "Hello",
      text: "Hello body",
      html: "<p>Hello body</p>",
      headers: {
        "In-Reply-To": "<msg@example.com>"
      }
    });
    expect(result.providerMessageId).toBe("<smtp-1@example.com>");
  });

  it("rejects outbound mail when all recipient lists are empty", async () => {
    const sendMail = vi.fn(async () => ({
      messageId: "<smtp-empty@example.com>"
    }));
    const sender = createSmtpTransportSender(
      {
        from: "mailclaws@example.com",
        host: "smtp.example.com",
        port: 587,
        secure: false
      },
      () => ({
        sendMail
      })
    );

    await expect(
      sender.send({
        outboxId: "outbox-empty",
        to: [],
        cc: [],
        bcc: [],
        subject: "Hello",
        textBody: "Hello body",
        headers: {}
      })
    ).rejects.toThrow(/recipient/i);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it.each<{ name: string; headers: Record<string, string>; error: RegExp }>([
    {
      name: "invalid Message-ID",
      headers: {
        "Message-ID": "invalid-message-id"
      },
      error: /message-id/i
    },
    {
      name: "invalid In-Reply-To",
      headers: {
        "In-Reply-To": "invalid-in-reply-to"
      },
      error: /in-reply-to/i
    },
    {
      name: "invalid References",
      headers: {
        References: "<valid@example.com> invalid-reference"
      },
      error: /references/i
    }
  ] satisfies Array<{
    name: string;
    headers: SmtpMessage["headers"];
    error: RegExp;
  }>)("rejects $name headers before delivery", async ({ headers, error }) => {
    const sendMail = vi.fn(async () => ({
      messageId: "<smtp-2@example.com>"
    }));
    const sender = createSmtpTransportSender(
      {
        from: "mailclaws@example.com",
        host: "smtp.example.com",
        port: 587,
        secure: false
      },
      () => ({
        sendMail
      })
    );

    await expect(
      sender.send({
        outboxId: "outbox-invalid-header",
        to: ["a@example.com"],
        cc: [],
        bcc: [],
        subject: "Hello",
        textBody: "Hello body",
        headers
      })
    ).rejects.toThrow(error);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("builds a configured smtp sender from environment settings", () => {
    const config = loadConfig({
      MAILCLAW_SMTP_HOST: "smtp.example.com",
      MAILCLAW_SMTP_PORT: "465",
      MAILCLAW_SMTP_SECURE: "true",
      MAILCLAW_SMTP_FROM: "mailclaws@example.com"
    });

    const sender = createConfiguredSmtpSender(config, () => ({
      sendMail: vi.fn(async () => ({
        messageId: "<smtp-2@example.com>"
      }))
    }));

    expect(sender).not.toBeNull();
  });

  it("uses refreshed OAuth tokens for account-scoped SMTP transports", async () => {
    const sendMail = vi.fn(async () => ({
      messageId: "<smtp-oauth@example.com>"
    }));
    const transportFactory = vi.fn(() => ({
      sendMail
    }));
    const sender = createAccountSmtpSender(
      {
        smtp: {
          host: "smtp.office365.com",
          port: 587,
          secure: false,
          username: "user@outlook.com",
          from: "user@outlook.com",
          oauth: {
            accessToken: "expired-token",
            refreshToken: "refresh-token-1",
            clientId: "client-id-1",
            clientSecret: "client-secret-1",
            tokenEndpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
            expiry: "2020-01-01T00:00:00.000Z"
          }
        }
      },
      {
        transportFactory,
        async fetchImpl(url, init) {
          expect(String(url)).toBe("https://login.microsoftonline.com/common/oauth2/v2.0/token");
          expect(init?.body instanceof URLSearchParams ? init.body.toString() : "").toContain(
            "refresh_token=refresh-token-1"
          );
          return new Response(
            JSON.stringify({
              access_token: "fresh-smtp-access-token",
              expires_in: 3600,
              token_type: "Bearer"
            }),
            {
              status: 200,
              headers: {
                "content-type": "application/json"
              }
            }
          );
        }
      }
    );

    if (!sender) {
      throw new Error("expected sender");
    }

    await sender.send({
      outboxId: "outbox-oauth-1",
      to: ["a@example.com"],
      cc: [],
      bcc: [],
      subject: "OAuth SMTP",
      textBody: "OAuth SMTP body",
      headers: {}
    });

    expect(transportFactory).toHaveBeenCalledWith({
      host: "smtp.office365.com",
      port: 587,
      secure: false,
      auth: {
        type: "OAuth2",
        user: "user@outlook.com",
        accessToken: "fresh-smtp-access-token"
      }
    });
  });
});
