import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createConfiguredGmailSender,
  fetchConfiguredGmailNotificationBatch,
  fetchConfiguredGmailMessage,
  parseGmailPubsubNotification,
  fetchConfiguredGmailWatchBatch,
  mapGmailMessageToEnvelope,
  recoverConfiguredGmailMailbox
} from "../src/providers/gmail.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("gmail provider adapter", () => {
  it("maps Gmail messages into provider envelopes", () => {
    const envelope = mapGmailMessageToEnvelope({
      id: "gmail-1",
      threadId: "gmail-thread-1",
      internalDate: "1767225600000",
      payload: {
        headers: [
          { name: "Message-ID", value: "<gmail-1@example.com>" },
          { name: "Subject", value: "Gmail subject" },
          { name: "From", value: "\"Sender\" <sender@example.com>" },
          { name: "To", value: "assistant@example.com, team@example.com" },
          { name: "Cc", value: "copy@example.com" },
          { name: "Reply-To", value: "reply@example.com" },
          { name: "Delivered-To", value: "assistant@example.com" }
        ]
      },
      textBody: "Hello from Gmail",
      attachments: [
        {
          filename: "report.csv",
          mimeType: "text/csv",
          size: 16
        }
      ]
    });

    expect(envelope).toMatchObject({
      providerMessageId: "gmail-1",
      threadId: "gmail-thread-1",
      envelopeRecipients: ["assistant@example.com"],
      messageId: "<gmail-1@example.com>",
      subject: "Gmail subject",
      from: {
        name: "Sender",
        email: "sender@example.com"
      },
      to: [
        { email: "assistant@example.com" },
        { email: "team@example.com" }
      ],
      cc: [{ email: "copy@example.com" }],
      replyTo: [{ email: "reply@example.com" }],
      text: "Hello from Gmail"
    });
    expect(envelope.attachments?.[0]).toMatchObject({
      filename: "report.csv",
      mimeType: "text/csv"
    });
  });

  it("builds watch/history batches with durable checkpoint metadata", async () => {
    const batch = await fetchConfiguredGmailWatchBatch(
      {
        accountId: "acct-gmail",
        settings: {
          gmail: {
            accessToken: "token",
            topicName: "projects/example/topics/mailclaws",
            watch: {
              historyId: "90"
            }
          }
        },
        checkpoint: "90",
        signal: new AbortController().signal,
        now: () => new Date("2026-03-25T00:00:00.000Z")
      },
      {
        clientFactory() {
          return {
            async watch() {
              return {
                historyId: "95",
                expiration: "2026-03-30T00:00:00.000Z"
              };
            },
            async listHistory() {
              return {
                historyId: "101",
                history: [
                  {
                    id: "100",
                    messagesAdded: [
                      {
                        message: {
                          id: "gmail-1",
                          threadId: "thread-1"
                        }
                      }
                    ]
                  },
                  {
                    id: "101",
                    messagesAdded: [
                      {
                        message: {
                          id: "gmail-1",
                          threadId: "thread-1"
                        }
                      },
                      {
                        message: {
                          id: "gmail-2",
                          threadId: "thread-1"
                        }
                      }
                    ]
                  }
                ]
              };
            },
            async listMessages() {
              throw new Error("not used in this test");
            },
            async getMessage() {
              throw new Error("not used in this test");
            }
          };
        }
      }
    );

    expect(batch.notifications).toEqual([
      {
        id: "gmail-1",
        cursor: "100",
        threadId: "thread-1"
      },
      {
        id: "gmail-2",
        cursor: "101",
        threadId: "thread-1"
      }
    ]);
    expect(batch.checkpoint).toBe("101");
    expect(batch.checkpointMetadata).toMatchObject({
      source: "gmail.watch",
      watchHistoryId: "95",
      watchExpiration: "2026-03-30T00:00:00.000Z"
    });
  });

  it("parses Gmail Pub/Sub push notifications", () => {
    const notification = parseGmailPubsubNotification({
      message: {
        data: Buffer.from(
          JSON.stringify({
            emailAddress: "assistant@example.com",
            historyId: "101"
          })
        ).toString("base64url"),
        messageId: "pubsub-1",
        publishTime: "2026-03-25T00:00:00.000Z",
        attributes: {
          source: "gmail"
        }
      },
      subscription: "projects/example/subscriptions/mailclaws"
    });

    expect(notification).toMatchObject({
      emailAddress: "assistant@example.com",
      historyId: "101",
      messageId: "pubsub-1",
      publishTime: "2026-03-25T00:00:00.000Z",
      subscription: "projects/example/subscriptions/mailclaws",
      attributes: {
        source: "gmail"
      }
    });
  });

  it("marks a history invalidation and returns bounded backfill notifications for durable recovery", async () => {
    const batch = await fetchConfiguredGmailWatchBatch(
      {
        accountId: "acct-gmail",
        settings: {
          gmail: {
            accessToken: "token",
            topicName: "projects/example/topics/mailclaws",
            watch: {
              historyId: "90"
            }
          }
        },
        checkpoint: "90",
        signal: new AbortController().signal
      },
      {
        clientFactory() {
          return {
            async watch() {
              return {
                historyId: "120",
                expiration: "2026-03-30T00:00:00.000Z"
              };
            },
            async listHistory() {
              const error = new Error("history gap") as Error & { status?: number };
              error.status = 404;
              throw error;
            },
            async listMessages() {
              return {
                messages: [
                  {
                    id: "gmail-backfill-1",
                    threadId: "thread-backfill-1"
                  },
                  {
                    id: "gmail-backfill-2",
                    threadId: "thread-backfill-2"
                  }
                ]
              };
            },
            async getMessage() {
              throw new Error("not used in this test");
            }
          };
        }
      }
    );

    expect(batch.notifications).toEqual([
      {
        id: "gmail-backfill-1",
        threadId: "thread-backfill-1"
      },
      {
        id: "gmail-backfill-2",
        threadId: "thread-backfill-2"
      }
    ]);
    expect(batch.checkpoint).toBe("120");
    expect(batch.checkpointMetadata).toMatchObject({
      historyInvalidated: true,
      invalidatedCheckpoint: "90",
      watchHistoryId: "120",
      backfillCompleted: true,
      backfillCount: 2,
      backfillSource: "gmail.messages.list"
    });
  });

  it("builds pubsub-triggered batches and escalates to full mailbox recovery without a checkpoint", async () => {
    const batch = await fetchConfiguredGmailNotificationBatch(
      {
        accountId: "acct-gmail",
        settings: {
          gmail: {
            accessToken: "token",
            topicName: "projects/example/topics/mailclaws",
            watch: {
              historyId: "90"
            }
          }
        },
        notification: {
          emailAddress: "assistant@example.com",
          historyId: "150",
          messageId: "pubsub-1"
        },
        signal: new AbortController().signal
      },
      {
        clientFactory() {
          return {
            async watch() {
              return {
                historyId: "160",
                expiration: "2026-03-30T00:00:00.000Z"
              };
            },
            async listHistory() {
              throw new Error("not used in this test");
            },
            async listMessages() {
              return {
                messages: [
                  {
                    id: "gmail-recovery-1",
                    threadId: "thread-recovery-1"
                  }
                ]
              };
            },
            async getMessage() {
              throw new Error("not used in this test");
            }
          };
        }
      }
    );

    expect(batch.notifications).toEqual([
      {
        id: "gmail-recovery-1",
        threadId: "thread-recovery-1"
      }
    ]);
    expect(batch.checkpoint).toBe("160");
    expect(batch.checkpointMetadata).toMatchObject({
      source: "gmail.pubsub",
      watchHistoryId: "160",
      fullMailboxRecovery: true,
      recoveryCompleted: true,
      recoveryCount: 1,
      recoveryReason: "missing_checkpoint",
      notificationHistoryId: "150",
      notificationEmailAddress: "assistant@example.com",
      pubsubMessageId: "pubsub-1"
    });
  });

  it("recovers the full mailbox for explicit Gmail recovery flows", async () => {
    const batch = await recoverConfiguredGmailMailbox(
      {
        accountId: "acct-gmail",
        settings: {
          gmail: {
            accessToken: "token",
            topicName: "projects/example/topics/mailclaws"
          }
        },
        checkpoint: "120",
        signal: new AbortController().signal,
        reason: "manual"
      },
      {
        clientFactory() {
          return {
            async watch() {
              return {
                historyId: "180",
                expiration: "2026-03-30T00:00:00.000Z"
              };
            },
            async listHistory() {
              throw new Error("not used in this test");
            },
            async listMessages(input) {
              if (!input.pageToken) {
                return {
                  messages: [
                    {
                      id: "gmail-recovery-1",
                      threadId: "thread-recovery-1"
                    }
                  ],
                  nextPageToken: "page-2"
                };
              }

              return {
                messages: [
                  {
                    id: "gmail-recovery-2",
                    threadId: "thread-recovery-2"
                  }
                ]
              };
            },
            async getMessage() {
              throw new Error("not used in this test");
            }
          };
        }
      }
    );

    expect(batch.notifications).toEqual([
      {
        id: "gmail-recovery-1",
        threadId: "thread-recovery-1"
      },
      {
        id: "gmail-recovery-2",
        threadId: "thread-recovery-2"
      }
    ]);
    expect(batch.checkpoint).toBe("180");
    expect(batch.checkpointMetadata).toMatchObject({
      source: "gmail.recovery",
      watchHistoryId: "180",
      fullMailboxRecovery: true,
      recoveryCompleted: true,
      recoveryCount: 2,
      recoveryReason: "manual"
    });
  });

  it("fetches message payloads from the configured Gmail client", async () => {
    const message = await fetchConfiguredGmailMessage(
      {
        accountId: "acct-gmail",
        settings: {
          gmail: {
            accessToken: "token",
            topicName: "projects/example/topics/mailclaws"
          }
        },
        notification: {
          id: "gmail-77"
        },
        signal: new AbortController().signal
      },
      {
        clientFactory() {
          return {
            async watch() {
              throw new Error("not used in this test");
            },
            async listHistory() {
              throw new Error("not used in this test");
            },
            async listMessages() {
              throw new Error("not used in this test");
            },
            async getMessage() {
              return {
                id: "gmail-77",
                payload: {
                  headers: [
                    {
                      name: "Message-ID",
                      value: "<gmail-77@example.com>"
                    }
                  ]
                }
              };
            }
          };
        }
      }
    );

    expect(message).toMatchObject({
      id: "gmail-77"
    });
  });

  it("sends raw Gmail messages through the configured sender and preserves thread hints", async () => {
    const calls: Array<{ userId: string; raw: string; threadId?: string }> = [];
    const sender = createConfiguredGmailSender(
      {
        gmail: {
          accessToken: "token",
          userId: "me"
        }
      },
      {
        clientFactory() {
          return {
            async sendMessage(input) {
              calls.push({
                userId: input.userId,
                raw: input.raw,
                threadId: input.threadId
              });
              return {
                id: "gmail-sent-1",
                threadId: input.threadId
              };
            }
          };
        }
      }
    );

    const result = await sender.send({
      outboxId: "gmail-outbox-1",
      to: ["user@example.com"],
      cc: ["cc@example.com"],
      bcc: [],
      subject: "ignored",
      textBody: "Plain body",
      htmlBody: "<p>HTML body</p>",
      headers: {
        From: "assistant@example.com",
        To: "user@example.com",
        Cc: "cc@example.com",
        Subject: "Gmail send subject",
        "Message-ID": "<gmail-send-1@example.com>",
        "In-Reply-To": "<parent@example.com>",
        References: "<root@example.com> <parent@example.com>"
      },
      threadId: "gmail-thread-123"
    });

    expect(result).toEqual({
      providerMessageId: "gmail-sent-1",
      providerThreadId: "gmail-thread-123"
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.userId).toBe("me");
    expect(calls[0]?.threadId).toBe("gmail-thread-123");
    const raw = Buffer.from(calls[0]!.raw, "base64url").toString("utf8");
    expect(raw).toContain("From: assistant@example.com");
    expect(raw).toContain("To: user@example.com");
    expect(raw).toContain("Cc: cc@example.com");
    expect(raw).toContain("Subject: Gmail send subject");
    expect(raw).toContain("Message-ID: <gmail-send-1@example.com>");
    expect(raw).toContain('Content-Type: multipart/alternative;');
    expect(raw).toContain("Plain body");
    expect(raw).toContain("<p>HTML body</p>");
  });

  it("uses the configured Gmail userId in the send endpoint", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        id: "gmail-sent-delegated",
        threadId: "gmail-thread-delegated"
      })
    }));
    vi.stubGlobal("fetch", fetchMock);

    const sender = createConfiguredGmailSender({
      gmail: {
        accessToken: "token",
        userId: "delegated-user@example.com"
      }
    });

    await sender.send({
      outboxId: "gmail-outbox-delegated",
      to: ["user@example.com"],
      cc: [],
      bcc: [],
      subject: "ignored",
      textBody: "Plain body",
      headers: {
        From: "assistant@example.com",
        To: "user@example.com",
        Subject: "Delegated Gmail send",
        "Message-ID": "<gmail-send-delegated@example.com>"
      }
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const fetchCalls = fetchMock.mock.calls as unknown as Array<[string, RequestInit?]>;
    expect(fetchCalls[0]?.[0]).toBe(
      "https://gmail.googleapis.com/gmail/v1/users/delegated-user%40example.com/messages/send"
    );
  });

  it("refreshes Gmail access tokens before fetching messages when only a refresh token is configured", async () => {
    const message = await fetchConfiguredGmailMessage(
      {
        accountId: "acct-gmail",
        settings: {
          gmail: {
            oauthRefreshToken: "refresh-token",
            oauthClientId: "client-id",
            oauthClientSecret: "client-secret",
            topicName: "projects/example/topics/mailclaws"
          }
        },
        notification: {
          id: "gmail-refresh-1"
        },
        signal: new AbortController().signal
      },
      {
        oauthClient: {
          async exchangeAuthorizationCode() {
            throw new Error("not used in this test");
          },
          async refreshAccessToken(input) {
            expect(input).toMatchObject({
              clientId: "client-id",
              clientSecret: "client-secret",
              refreshToken: "refresh-token"
            });
            return {
              accessToken: "fresh-access-token"
            };
          },
          async getProfile() {
            throw new Error("not used in this test");
          }
        },
        clientFactory(config) {
          expect(config.accessToken).toBe("fresh-access-token");
          return {
            async watch() {
              throw new Error("not used in this test");
            },
            async listHistory() {
              throw new Error("not used in this test");
            },
            async listMessages() {
              throw new Error("not used in this test");
            },
            async getMessage() {
              return {
                id: "gmail-refresh-1"
              };
            }
          };
        }
      }
    );

    expect(message).toMatchObject({
      id: "gmail-refresh-1"
    });
  });

  it("refreshes expired Gmail access tokens before sending", async () => {
    const calls: string[] = [];
    const sender = createConfiguredGmailSender(
      {
        gmail: {
          oauthAccessToken: "expired-access-token",
          oauthExpiry: "2020-01-01T00:00:00.000Z",
          oauthRefreshToken: "refresh-token",
          oauthClientId: "client-id",
          userId: "me"
        }
      },
      {
        oauthClient: {
          async exchangeAuthorizationCode() {
            throw new Error("not used in this test");
          },
          async refreshAccessToken(input) {
            expect(input).toMatchObject({
              clientId: "client-id",
              refreshToken: "refresh-token"
            });
            return {
              accessToken: "fresh-access-token"
            };
          },
          async getProfile() {
            throw new Error("not used in this test");
          }
        },
        clientFactory(config) {
          calls.push(config.accessToken);
          return {
            async sendMessage() {
              return {
                id: "gmail-sent-refresh"
              };
            }
          };
        }
      }
    );

    await sender.send({
      outboxId: "gmail-outbox-refresh",
      to: ["user@example.com"],
      cc: [],
      bcc: [],
      subject: "ignored",
      textBody: "body",
      headers: {
        From: "assistant@example.com",
        To: "user@example.com",
        Subject: "Refresh send",
        "Message-ID": "<gmail-send-refresh@example.com>"
      }
    });

    expect(calls).toEqual(["expired-access-token", "fresh-access-token"]);
  });
});
