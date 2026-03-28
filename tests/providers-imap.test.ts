import { describe, expect, it } from "vitest";

import {
  fetchConfiguredImapMessages,
  mapImapMessageToEnvelope,
  type ImapClientLike
} from "../src/providers/imap.js";
import { createMailLab } from "./helpers/mail-lab.js";

describe("imap provider adapter", () => {
  it("maps fetched IMAP messages into provider envelopes", () => {
    const envelope = mapImapMessageToEnvelope({
      uid: 42,
      threadId: "imap-thread-1",
      envelopeRecipients: ["assistant@example.com"],
      subject: "IMAP subject",
      messageId: "<imap-42@example.com>",
      from: [{ name: "Sender", email: "sender@example.com" }],
      to: [{ email: "assistant@example.com" }],
      cc: [{ email: "team@example.com" }],
      replyTo: [{ email: "reply@example.com" }],
      headers: {
        "Message-ID": "<imap-42@example.com>",
        References: ["<root@example.com>"]
      },
      text: "Hello from IMAP",
      attachments: [
        {
          filename: "notes.txt",
          contentType: "text/plain",
          size: 12,
          data: "hello"
        }
      ]
    });

    expect(envelope).toMatchObject({
      providerMessageId: "42",
      threadId: "imap-thread-1",
      envelopeRecipients: ["assistant@example.com"],
      subject: "IMAP subject",
      messageId: "<imap-42@example.com>",
      from: {
        email: "sender@example.com"
      },
      to: [{ email: "assistant@example.com" }],
      cc: [{ email: "team@example.com" }],
      replyTo: [{ email: "reply@example.com" }],
      text: "Hello from IMAP"
    });
    expect(envelope.attachments?.[0]).toMatchObject({
      filename: "notes.txt",
      mimeType: "text/plain"
    });
    expect(envelope.headers).toEqual(
      expect.arrayContaining([
        {
          name: "Message-ID",
          value: "<imap-42@example.com>"
        }
      ])
    );
  });

  it("fetches IMAP messages from configured account settings", async () => {
    const clientEvents: string[] = [];
    const createdConfigs: unknown[] = [];
    const fetchedMessages = [
      {
        uid: 101,
        envelope: {
          subject: "first",
          from: [{ name: "Sender", address: "sender@example.com" }],
          to: [{ address: "mailclaw@example.com" }],
          date: new Date("2026-03-25T00:00:00.000Z")
        },
        source: "raw-101"
      },
      {
        uid: 102,
        envelope: {
          subject: "second",
          from: [{ address: "sender@example.com" }],
          to: [{ address: "mailclaw@example.com" }],
          date: new Date("2026-03-25T00:01:00.000Z")
        },
        source: "raw-102"
      }
    ];

    const batch = await fetchConfiguredImapMessages(
      {
        accountId: "acct-imap",
        mailboxAddress: "mailclaw@example.com",
        checkpoint: "100",
        settings: {
          host: "imap.example.com",
          port: 993,
          secure: true,
          username: "mailclaw@example.com",
          password: "secret",
          mailbox: "INBOX"
        },
        signal: new AbortController().signal
      },
      {
        clientFactory(config) {
          createdConfigs.push(config);

          return {
            async connect() {
              clientEvents.push("connect");
            },
            async mailboxOpen(path) {
              clientEvents.push(`mailbox:${path}`);
              return {
                uidValidity: 7001
              };
            },
            fetch(range) {
              clientEvents.push(`fetch:${range}`);
              return fetchedMessages;
            },
            async logout() {
              clientEvents.push("logout");
            }
          } satisfies ImapClientLike;
        }
      }
    );

    expect(createdConfigs).toEqual([
      expect.objectContaining({
        host: "imap.example.com",
        port: 993,
        secure: true,
        auth: {
          user: "mailclaw@example.com",
          pass: "secret"
        }
      })
    ]);
    expect(clientEvents).toEqual(["connect", "mailbox:INBOX", "fetch:101:*", "logout"]);
    expect(batch).toMatchObject({
      checkpoint: "102",
      checkpointMetadata: {
        uidValidity: "7001"
      },
      done: true
    });
    expect(batch.messages).toHaveLength(2);
    expect(batch.messages[0]).toMatchObject({
      uid: "101",
      subject: "first",
      from: [{ email: "sender@example.com", name: "Sender" }],
      to: [{ email: "mailclaw@example.com" }]
    });
    expect(batch.messages[1]?.raw).toBe("raw-102");
  });

  it("refreshes OAuth tokens for IMAP accounts before connecting", async () => {
    const createdConfigs: unknown[] = [];
    const tokenRequests: Array<{
      url: string;
      body: string;
    }> = [];

    const batch = await fetchConfiguredImapMessages(
      {
        accountId: "acct-outlook",
        mailboxAddress: "user@outlook.com",
        checkpoint: "0",
        settings: {
          imap: {
            host: "outlook.office365.com",
            port: 993,
            secure: true,
            username: "user@outlook.com",
            mailbox: "INBOX",
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
        signal: new AbortController().signal
      },
      {
        async fetchImpl(url, init) {
          tokenRequests.push({
            url: String(url),
            body: init?.body instanceof URLSearchParams ? init.body.toString() : String(init?.body ?? "")
          });
          return new Response(
            JSON.stringify({
              access_token: "fresh-imap-access-token",
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
        },
        clientFactory(config) {
          createdConfigs.push(config);
          return {
            async connect() {
              return undefined;
            },
            async mailboxOpen() {
              return {
                uidValidity: 9001
              };
            },
            fetch() {
              return [];
            },
            async logout() {
              return undefined;
            }
          } satisfies ImapClientLike;
        }
      }
    );

    expect(batch.checkpointMetadata).toMatchObject({
      uidValidity: "9001"
    });
    expect(tokenRequests).toEqual([
      expect.objectContaining({
        url: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        body: expect.stringContaining("refresh_token=refresh-token-1")
      })
    ]);
    expect(createdConfigs).toEqual([
      expect.objectContaining({
        host: "outlook.office365.com",
        auth: {
          user: "user@outlook.com",
          accessToken: "fresh-imap-access-token"
        }
      })
    ]);
  });

  it("resets the IMAP checkpoint when UIDVALIDITY changes", async () => {
    const clientEvents: string[] = [];

    const batch = await fetchConfiguredImapMessages(
      {
        accountId: "acct-imap",
        mailboxAddress: "mailclaw@example.com",
        checkpoint: "100",
        settings: {
          host: "imap.example.com",
          port: 993,
          secure: true,
          username: "mailclaw@example.com",
          password: "secret",
          mailbox: "INBOX",
          watch: {
            uidValidity: "7001"
          }
        },
        signal: new AbortController().signal
      },
      {
        clientFactory() {
          return {
            async connect() {
              clientEvents.push("connect");
            },
            async mailboxOpen(path) {
              clientEvents.push(`mailbox:${path}`);
              return {
                uidValidity: 8002
              };
            },
            fetch(range) {
              clientEvents.push(`fetch:${range}`);
              return [];
            },
            async logout() {
              clientEvents.push("logout");
            }
          } satisfies ImapClientLike;
        }
      }
    );

    expect(clientEvents).toEqual(["connect", "mailbox:INBOX", "fetch:1:*", "logout"]);
    expect(batch).toMatchObject({
      checkpoint: "0",
      checkpointMetadata: {
        uidValidity: "8002",
        cursorInvalidated: true,
        invalidationReason: "imap.uidvalidity_changed",
        invalidatedCheckpoint: "100",
        previousUidValidity: "7001",
        backfillCompleted: true,
        backfillCount: 0
      },
      done: true
    });
  });

  it("parses raw RFC822 MIME messages into structured envelopes during configured fetch", async () => {
    const lab = createMailLab("imap-mime");
    const mimeEnvelope = lab.newMail({
      providerMessageId: "imap-mime-1",
      subject: "Parsed MIME message",
      text: "Hello from a raw MIME message.",
      attachments: [
        {
          filename: "notes.txt",
          mimeType: "text/plain",
          data: "Attachment body from the local mail lab."
        }
      ]
    });

    const batch = await fetchConfiguredImapMessages(
      {
        accountId: "acct-imap",
        mailboxAddress: lab.addresses.assistant,
        checkpoint: "0",
        settings: {
          host: "imap.example.com",
          port: 993,
          secure: true,
          username: lab.addresses.assistant,
          password: "secret",
          mailbox: "INBOX"
        },
        signal: new AbortController().signal
      },
      {
        clientFactory() {
          return {
            async connect() {
              return undefined;
            },
            async mailboxOpen() {
              return {
                uidValidity: 7001
              };
            },
            fetch() {
              return [
                {
                  uid: 1,
                  envelope: {
                    subject: "fallback subject",
                    from: [{ address: lab.addresses.customerA }],
                    to: [{ address: lab.addresses.assistant }]
                  },
                  source: mimeEnvelope.rawMime
                }
              ];
            },
            async logout() {
              return undefined;
            }
          } satisfies ImapClientLike;
        }
      }
    );

    expect(batch.checkpoint).toBe("1");
    expect(batch.messages[0]).toMatchObject({
      uid: "1",
      subject: "Parsed MIME message",
      messageId: mimeEnvelope.messageId,
      text: "Hello from a raw MIME message.",
      raw: mimeEnvelope.rawMime
    });
    expect(batch.messages[0]?.from).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          email: lab.addresses.customerA
        })
      ])
    );
    expect(batch.messages[0]?.to).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          email: lab.addresses.assistant
        })
      ])
    );
    expect(batch.messages[0]?.attachments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filename: "notes.txt",
          contentType: "text/plain"
        })
      ])
    );
    expect(batch.messages[0]?.headers).toMatchObject({
      "Message-ID": mimeEnvelope.messageId,
      Subject: "Parsed MIME message"
    });
  });
});
