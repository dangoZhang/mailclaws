import readline from "node:readline/promises";
import { Writable } from "node:stream";
import process from "node:process";

import type { MailAccountRecord } from "../storage/repositories/mail-accounts.js";

export interface MailctlPrompter {
  ask(prompt: string, options?: { defaultValue?: string; secret?: boolean }): Promise<string>;
  close(): void;
}

export function createTerminalPrompter(
  input: NodeJS.ReadStream = process.stdin,
  output: NodeJS.WriteStream = process.stdout
): MailctlPrompter {
  let muted = false;
  const mirror = new Writable({
    write(chunk, encoding, callback) {
      if (!muted) {
        output.write(chunk, encoding as BufferEncoding, callback);
        return;
      }

      const value = chunk.toString();
      if (value.includes("\n")) {
        output.write("\n");
      }
      callback();
    }
  });
  const rl = readline.createInterface({
    input,
    output: mirror,
    terminal: true
  });

  return {
    async ask(prompt, options) {
      const suffix =
        typeof options?.defaultValue === "string" && options.defaultValue.length > 0
          ? ` [${options.defaultValue}]`
          : "";
      output.write(`${prompt}${suffix}: `);
      muted = options?.secret === true;
      try {
        const answer = await rl.question("");
        const trimmed = answer.trim();
        return trimmed.length > 0 ? trimmed : options?.defaultValue ?? "";
      } finally {
        if (muted) {
          output.write("\n");
        }
        muted = false;
      }
    },
    close() {
      rl.close();
    }
  };
}

export interface InteractiveMailboxLoginResult {
  account: Omit<MailAccountRecord, "createdAt" | "updatedAt">;
  warnings: string[];
}

export async function promptInteractiveMailboxLogin(
  prompter: MailctlPrompter,
  options: {
    accountId?: string;
    displayName?: string;
    emailAddress?: string;
    password?: string;
    providerPreset?: string;
  } = {}
): Promise<InteractiveMailboxLoginResult> {
  const warnings: string[] = [];
  const emailAddress = await askRequired(prompter, "Email address", options.emailAddress);
  const profile = detectMailboxProfile(emailAddress, options.providerPreset);
  if (profile?.warning) {
    warnings.push(profile.warning);
  }

  const password = await askRequired(prompter, "Password or app password", options.password, true);
  const accountId = await askRequired(
    prompter,
    "Account ID",
    options.accountId ?? createDefaultAccountId(emailAddress)
  );
  const displayName = await prompter.ask("Display name", {
    defaultValue: options.displayName ?? inferDisplayName(emailAddress)
  });
  const imapHost = await askRequired(prompter, "IMAP host", profile?.imapHost);
  const imapPort = parsePositiveInteger(await askRequired(prompter, "IMAP port", String(profile?.imapPort ?? 993)));
  const imapSecure = parseBooleanChoice(
    await askRequired(prompter, "IMAP secure (yes/no)", yesNo(profile?.imapSecure ?? true))
  );
  const imapMailbox = await askRequired(prompter, "IMAP mailbox", profile?.imapMailbox ?? "INBOX");
  const smtpHost = await askRequired(prompter, "SMTP host", profile?.smtpHost);
  const smtpPort = parsePositiveInteger(await askRequired(prompter, "SMTP port", String(profile?.smtpPort ?? 587)));
  const smtpSecure = parseBooleanChoice(
    await askRequired(prompter, "SMTP secure (yes/no)", yesNo(profile?.smtpSecure ?? false))
  );
  const smtpFrom = await askRequired(prompter, "SMTP from address", emailAddress);

  return {
    warnings,
    account: {
      accountId,
      provider: "imap",
      emailAddress,
      displayName: displayName || undefined,
      status: "active",
      settings: {
        imap: {
          host: imapHost,
          port: imapPort,
          secure: imapSecure,
          username: emailAddress,
          password,
          mailbox: imapMailbox
        },
        smtp: {
          host: smtpHost,
          port: smtpPort,
          secure: smtpSecure,
          username: emailAddress,
          password,
          from: smtpFrom
        }
      }
    }
  };
}

interface MailboxProfile {
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  imapMailbox?: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  warning?: string;
}

export function resolveMailboxProfilePreset(providerPreset?: string): MailboxProfile | null {
  const normalized = providerPreset?.trim().toLowerCase();
  switch (normalized) {
    case "gmail":
    case "googlemail":
      return {
        imapHost: "imap.gmail.com",
        imapPort: 993,
        imapSecure: true,
        smtpHost: "smtp.gmail.com",
        smtpPort: 465,
        smtpSecure: true,
        warning:
          "Gmail password login usually needs an app password. If you want browser OAuth instead, use `mailctl connect login gmail <accountId>`."
      };
    case "qq":
      return {
        imapHost: "imap.qq.com",
        imapPort: 993,
        imapSecure: true,
        smtpHost: "smtp.qq.com",
        smtpPort: 465,
        smtpSecure: true,
        warning: "QQ Mail typically requires an authorization code instead of the web password."
      };
    case "outlook":
    case "microsoft":
    case "office365":
    case "hotmail":
    case "live":
    case "msn":
      return {
        imapHost: "outlook.office365.com",
        imapPort: 993,
        imapSecure: true,
        smtpHost: "smtp.office365.com",
        smtpPort: 587,
        smtpSecure: false,
        warning:
          "Outlook and Microsoft 365 support browser OAuth. If you want OAuth instead of IMAP/SMTP credentials, use `mailctl connect login outlook <accountId>`."
      };
    case "icloud":
    case "me":
    case "mac":
      return {
        imapHost: "imap.mail.me.com",
        imapPort: 993,
        imapSecure: true,
        smtpHost: "smtp.mail.me.com",
        smtpPort: 587,
        smtpSecure: false,
        warning: "iCloud usually needs an app-specific password."
      };
    case "yahoo":
      return {
        imapHost: "imap.mail.yahoo.com",
        imapPort: 993,
        imapSecure: true,
        smtpHost: "smtp.mail.yahoo.com",
        smtpPort: 465,
        smtpSecure: true
      };
    case "163":
      return {
        imapHost: "imap.163.com",
        imapPort: 993,
        imapSecure: true,
        smtpHost: "smtp.163.com",
        smtpPort: 465,
        smtpSecure: true
      };
    case "126":
      return {
        imapHost: "imap.126.com",
        imapPort: 993,
        imapSecure: true,
        smtpHost: "smtp.126.com",
        smtpPort: 465,
        smtpSecure: true
      };
    default:
      return null;
  }
}

function detectMailboxProfile(emailAddress: string, providerPreset?: string): MailboxProfile | null {
  const preset = resolveMailboxProfilePreset(providerPreset);
  if (preset) {
    return preset;
  }

  const domain = emailAddress.split("@")[1]?.toLowerCase() ?? "";
  switch (domain) {
    case "gmail.com":
    case "googlemail.com":
      return resolveMailboxProfilePreset("gmail");
    case "qq.com":
      return resolveMailboxProfilePreset("qq");
    case "outlook.com":
    case "hotmail.com":
    case "live.com":
    case "msn.com":
      return resolveMailboxProfilePreset("outlook");
    case "icloud.com":
    case "me.com":
    case "mac.com":
      return resolveMailboxProfilePreset("icloud");
    case "yahoo.com":
      return resolveMailboxProfilePreset("yahoo");
    case "163.com":
      return resolveMailboxProfilePreset("163");
    case "126.com":
      return resolveMailboxProfilePreset("126");
    default:
      return null;
  }
}

async function askRequired(
  prompter: MailctlPrompter,
  prompt: string,
  defaultValue?: string,
  secret = false
): Promise<string> {
  while (true) {
    const value = await prompter.ask(prompt, {
      defaultValue,
      secret
    });
    if (value.trim().length > 0) {
      return value.trim();
    }
  }
}

function createDefaultAccountId(emailAddress: string) {
  return `acct-${emailAddress
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)}`;
}

function inferDisplayName(emailAddress: string) {
  const local = emailAddress.split("@")[0] ?? "";
  return local.trim();
}

function parsePositiveInteger(value: string) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`expected a positive integer, received: ${value}`);
  }
  return parsed;
}

function parseBooleanChoice(value: string) {
  const normalized = value.trim().toLowerCase();
  if (["y", "yes", "true", "1"].includes(normalized)) {
    return true;
  }
  if (["n", "no", "false", "0"].includes(normalized)) {
    return false;
  }
  throw new Error(`expected yes or no, received: ${value}`);
}

function yesNo(value: boolean) {
  return value ? "yes" : "no";
}
