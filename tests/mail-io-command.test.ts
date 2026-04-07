import { describe, expect, it, vi } from "vitest";

import {
  MAIL_IO_PROTOCOL_NAME,
  MAIL_IO_PROTOCOL_VERSION,
  isMailIoCommandOperation,
  runMailIoCommand
} from "../src/providers/mail-io-command.js";
import { resolveMailIoCliRequest } from "../src/cli/mailioctl.js";
import { createCommandMailIoPlane } from "../src/providers/mail-io-plane.js";

describe("mail io command", () => {
  it("validates supported direct operations", () => {
    expect(isMailIoCommandOperation("self_check")).toBe(true);
    expect(isMailIoCommandOperation("handshake")).toBe(true);
    expect(isMailIoCommandOperation("not_real")).toBe(false);
  });

  it("advertises a versioned handshake contract", async () => {
    const response = await runMailIoCommand({
      operation: "handshake",
      input: {}
    });

    expect(response).toEqual({
      protocol: MAIL_IO_PROTOCOL_NAME,
      version: MAIL_IO_PROTOCOL_VERSION,
      operation: "handshake",
      ok: true,
      result: {
        protocol: MAIL_IO_PROTOCOL_NAME,
        version: MAIL_IO_PROTOCOL_VERSION,
        operation: "handshake",
        sidecar: "mailioctl",
        status: "ready",
        capabilities: expect.arrayContaining([
          "deliver_outbox_message",
          "fetch_imap_messages",
          "fetch_gmail_message"
        ])
      }
    });
  });

  it("returns a self-check payload for sidecar health probes", async () => {
    const response = await runMailIoCommand({
      operation: "self_check",
      input: {}
    });

    expect(response).toMatchObject({
      protocol: MAIL_IO_PROTOCOL_NAME,
      version: MAIL_IO_PROTOCOL_VERSION,
      operation: "self_check",
      ok: true,
      result: {
        protocol: MAIL_IO_PROTOCOL_NAME,
        version: MAIL_IO_PROTOCOL_VERSION,
        operation: "self_check",
        sidecar: "mailioctl",
        status: "ready",
        capabilities: expect.arrayContaining(["self_check", "deliver_outbox_message"])
      }
    });
    const checkedAt = (response.ok ? (response.result as { checkedAt?: string }).checkedAt : undefined) ?? "";
    expect(checkedAt.length).toBeGreaterThan(0);
  });

  it("rejects unsupported operations instead of returning an empty success payload", async () => {
    const response = await runMailIoCommand({
      operation: "not_real" as never,
      input: {}
    });

    expect(response).toEqual({
      protocol: MAIL_IO_PROTOCOL_NAME,
      version: MAIL_IO_PROTOCOL_VERSION,
      operation: "not_real",
      ok: false,
      error: "unsupported mail io operation: not_real"
    });
  });

  it("delivers smtp outbox messages through the sidecar handler", async () => {
    const sendMail = vi.fn(async () => ({
      messageId: "<smtp-sidecar@example.com>"
    }));

    const response = await runMailIoCommand(
      {
        operation: "deliver_outbox_message",
        input: {
          deliveryContext: {
            provider: "smtp",
            transport: {
              from: "assistant@example.com",
              host: "smtp.example.com",
              port: 465,
              secure: true
            }
          },
          message: {
            outboxId: "outbox-1",
            to: ["user@example.com"],
            cc: [],
            bcc: [],
            subject: "hello",
            textBody: "world",
            headers: {
              "Message-ID": "<outbox-1@example.com>"
            }
          }
        }
      },
      {
        smtpTransportFactory: () => ({
          sendMail
        })
      }
    );

    expect(response).toEqual({
      protocol: MAIL_IO_PROTOCOL_NAME,
      version: MAIL_IO_PROTOCOL_VERSION,
      operation: "deliver_outbox_message",
      ok: true,
      result: {
        providerMessageId: "<smtp-sidecar@example.com>"
      }
    });
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it("fetches gmail messages through the sidecar handler", async () => {
    const getMessage = vi.fn(async () => ({
      id: "gmail-1",
      threadId: "gmail-thread-1",
      payload: {
        headers: [{ name: "Message-ID", value: "<gmail-1@example.com>" }]
      },
      textBody: "hello"
    }));

    const response = await runMailIoCommand(
      {
        operation: "fetch_gmail_message",
        input: {
          accountId: "acct-gmail",
          settings: {
            gmail: {
              accessToken: "token",
              topicName: "projects/example/topics/mailclaws"
            }
          },
          notification: {
            id: "gmail-1"
          }
        }
      },
      {
        gmailApiClientFactory: () => ({
          watch: vi.fn(),
          listHistory: vi.fn(),
          listMessages: vi.fn(),
          getMessage
        })
      }
    );

    expect(response).toEqual({
      protocol: MAIL_IO_PROTOCOL_NAME,
      version: MAIL_IO_PROTOCOL_VERSION,
      operation: "fetch_gmail_message",
      ok: true,
      result: expect.objectContaining({
        id: "gmail-1",
        threadId: "gmail-thread-1",
        textBody: "hello"
      })
    });
    expect(getMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "me",
        messageId: "gmail-1"
      })
    );
  });

  it("handshakes once before invoking command operations", async () => {
    const runner = vi.fn(async (_command: string, input: string) => {
      const payload = JSON.parse(input) as {
        operation: string;
        input: Record<string, unknown>;
      };
      if (payload.operation === "handshake") {
        return {
          stdout: JSON.stringify({
            protocol: MAIL_IO_PROTOCOL_NAME,
            version: MAIL_IO_PROTOCOL_VERSION,
            operation: "handshake",
            ok: true,
            result: {
              protocol: MAIL_IO_PROTOCOL_NAME,
              version: MAIL_IO_PROTOCOL_VERSION,
              operation: "handshake",
              sidecar: "mailioctl",
              status: "ready",
              capabilities: ["self_check", "fetch_imap_messages"]
            }
          }),
          stderr: "",
          exitCode: 0
        };
      }

      return {
        stdout: JSON.stringify({
          protocol: MAIL_IO_PROTOCOL_NAME,
          version: MAIL_IO_PROTOCOL_VERSION,
          operation: "fetch_imap_messages",
          ok: true,
          result: {
            messages: [],
            checkpoint: "2",
            checkpointMetadata: {
              uidValidity: "7001"
            },
            done: true
          }
        }),
        stderr: "",
        exitCode: 0
      };
    });
    const plane = createCommandMailIoPlane({
      command: "mail-io-sidecar",
      runner,
      defaultSmtpConfig: null,
      getRoom: () => null,
      getAccount: () => null,
      getProviderThreadId: () => undefined
    });

    await plane.fetchImapMessages({
      accountId: "acct-imap",
      mailboxAddress: "assistant@example.com",
      checkpoint: "1",
      settings: {
        imap: {
          host: "imap.example.com",
          port: 993,
          secure: true,
          username: "assistant@example.com",
          password: "secret"
        }
      },
      signal: new AbortController().signal
    });
    await plane.fetchImapMessages({
      accountId: "acct-imap",
      mailboxAddress: "assistant@example.com",
      checkpoint: "2",
      settings: {
        imap: {
          host: "imap.example.com",
          port: 993,
          secure: true,
          username: "assistant@example.com",
          password: "secret"
        }
      },
      signal: new AbortController().signal
    });

    expect(runner).toHaveBeenCalledTimes(3);
    expect(JSON.parse(runner.mock.calls[0]?.[1] ?? "{}")).toMatchObject({
      operation: "handshake"
    });
    expect(JSON.parse(runner.mock.calls[1]?.[1] ?? "{}")).toMatchObject({
      operation: "fetch_imap_messages",
      input: expect.objectContaining({
        accountId: "acct-imap",
        checkpoint: "1"
      })
    });
    expect(JSON.parse(runner.mock.calls[2]?.[1] ?? "{}")).toMatchObject({
      operation: "fetch_imap_messages",
      input: expect.objectContaining({
        accountId: "acct-imap",
        checkpoint: "2"
      })
    });
  });

  it("treats direct self_check invocation with empty stdin as an empty input payload", () => {
    expect(
      resolveMailIoCliRequest({
        argvOperation: "self_check",
        stdinIsTty: false,
        rawInput: ""
      })
    ).toEqual({
      operation: "self_check",
      input: {}
    });
  });
});
