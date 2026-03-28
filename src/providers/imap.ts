import { ImapFlow } from "imapflow";
import { simpleParser, type AddressObject, type ParsedMail } from "mailparser";

import { resolveOAuthAccessToken } from "../auth/oauth-core.js";
import type { ProviderAddress, ProviderAttachment, ProviderHeader, ProviderMailEnvelope } from "./types.js";
import type { ImapPollBatch } from "./watcher.js";

export interface ImapFetchedMessage {
  uid: string | number;
  threadId?: string;
  envelopeRecipients?: string[];
  subject?: string;
  messageId?: string;
  from?: ImapAddress[];
  to?: ImapAddress[];
  cc?: ImapAddress[];
  bcc?: ImapAddress[];
  replyTo?: ImapAddress[];
  date?: string | Date;
  headers?: Record<string, string | string[] | undefined>;
  text?: string;
  html?: string;
  attachments?: ImapAttachment[];
  raw?: unknown;
}

export interface ImapAddress {
  name?: string;
  email: string;
}

export interface ImapAttachment {
  filename?: string;
  contentType?: string;
  size?: number;
  contentId?: string;
  disposition?: string;
  data?: string | Uint8Array;
}

export interface ImapClientConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass?: string;
    accessToken?: string;
  };
}

export interface ImapClientFetchedEnvelopeAddress {
  name?: string;
  address?: string;
}

export interface ImapClientFetchedMessage {
  uid: string | number;
  envelope?: {
    subject?: string;
    from?: ImapClientFetchedEnvelopeAddress[];
    to?: ImapClientFetchedEnvelopeAddress[];
    cc?: ImapClientFetchedEnvelopeAddress[];
    bcc?: ImapClientFetchedEnvelopeAddress[];
    replyTo?: ImapClientFetchedEnvelopeAddress[];
    date?: string | Date;
  };
  source?: string | Uint8Array;
}

export interface ImapClientLike {
  connect(): Promise<void>;
  mailboxOpen(path: string): Promise<unknown>;
  fetch(
    range: string,
    query: Record<string, unknown>
  ): AsyncIterable<ImapClientFetchedMessage> | Iterable<ImapClientFetchedMessage>;
  logout(): Promise<void>;
}

export interface ConfiguredImapFetchInput {
  accountId: string;
  mailboxAddress: string;
  settings: Record<string, unknown>;
  checkpoint?: string;
  signal: AbortSignal;
}

export function mapImapMessageToEnvelope(message: ImapFetchedMessage): ProviderMailEnvelope {
  return {
    providerMessageId: String(message.uid),
    threadId: message.threadId,
    envelopeRecipients: normalizeRecipientList(message.envelopeRecipients),
    messageId: message.messageId,
    subject: message.subject ?? "",
    from: mapAddress(message.from?.[0]),
    to: mapAddresses(message.to),
    cc: mapAddresses(message.cc),
    bcc: mapAddresses(message.bcc),
    replyTo: mapAddresses(message.replyTo),
    date: message.date,
    headers: flattenHeaders(message.headers),
    text: message.text,
    html: message.html,
    attachments: mapAttachments(message.attachments),
    raw: message.raw ?? message
  };
}

export async function fetchConfiguredImapMessages(
  input: ConfiguredImapFetchInput,
  options: {
    clientFactory?: (config: ImapClientConfig) => ImapClientLike;
    fetchImpl?: typeof fetch;
  } = {}
): Promise<ImapPollBatch> {
  if (input.signal.aborted) {
    return {
      messages: [],
      checkpoint: input.checkpoint,
      done: true
    };
  }

  const settings = await resolveConfiguredImapSettings(input.settings, {
    fetchImpl: options.fetchImpl,
    signal: input.signal
  });
  const client = (options.clientFactory ?? createImapClient)(settings.config);
  const messages: ImapFetchedMessage[] = [];
  const previousUidValidity = readConfiguredUidValidity(input.settings);
  let currentUidValidity: string | undefined;
  let uidValidityChanged = false;

  await client.connect();
  try {
    const mailbox = await client.mailboxOpen(settings.mailbox);
    currentUidValidity = readMailboxUidValidity(mailbox);
    uidValidityChanged =
      previousUidValidity !== undefined &&
      currentUidValidity !== undefined &&
      previousUidValidity !== currentUidValidity;

    const startUid = parseCheckpointUid(uidValidityChanged ? "0" : input.checkpoint);
    const range = `${startUid}:*`;
    for await (const fetched of toAsyncIterable(client.fetch(range, {
      uid: true,
      envelope: true,
      source: true
    }))) {
      if (input.signal.aborted) {
        break;
      }

      messages.push(await mapConfiguredImapFetchedMessage(fetched));
    }
  } finally {
    await client.logout().catch(() => undefined);
  }

  const checkpoint =
    messages.at(-1)?.uid
      ? String(messages.at(-1)?.uid)
      : uidValidityChanged
        ? "0"
        : input.checkpoint;

  return {
    messages,
    checkpoint,
    checkpointMetadata: {
      ...(currentUidValidity ? { uidValidity: currentUidValidity } : {}),
      ...(uidValidityChanged
        ? {
            cursorInvalidated: true,
            invalidationReason: "imap.uidvalidity_changed",
            invalidatedCheckpoint: input.checkpoint,
            previousUidValidity,
            backfillCompleted: true,
            backfillCount: messages.length
          }
        : {})
    },
    done: true
  };
}

export function hasConfiguredImapSettings(settings: Record<string, unknown>) {
  try {
    const providerSettings = resolveSettingsObject(settings);
    readRequiredString(providerSettings, "host");
    readRequiredString(providerSettings, "username");
    if (readOptionalObject(providerSettings, "oauth")) {
      const oauthSettings = readOptionalObject(providerSettings, "oauth")!;
      if (!readOptionalString(oauthSettings, "accessToken")) {
        readRequiredString(oauthSettings, "refreshToken");
      }
      readRequiredString(oauthSettings, "clientId");
      readRequiredString(oauthSettings, "tokenEndpoint");
    } else {
      readRequiredString(providerSettings, "password");
    }
    return true;
  } catch {
    return false;
  }
}

function mapAddress(address?: ImapAddress): ProviderAddress {
  return {
    name: address?.name,
    email: address?.email ?? "unknown@example.invalid"
  };
}

function mapAddresses(addresses?: ImapAddress[]) {
  return (addresses ?? []).map((address) => ({
    name: address.name,
    email: address.email
  }));
}

function mapAttachments(attachments?: ImapAttachment[]): ProviderAttachment[] {
  return (attachments ?? []).map((attachment) => ({
    filename: attachment.filename,
    mimeType: attachment.contentType,
    size: attachment.size,
    contentId: attachment.contentId,
    disposition: attachment.disposition,
    data: attachment.data
  }));
}

function flattenHeaders(headers?: Record<string, string | string[] | undefined>): ProviderHeader[] {
  if (!headers) {
    return [];
  }

  const values: ProviderHeader[] = [];
  for (const [name, rawValue] of Object.entries(headers)) {
    const entries = Array.isArray(rawValue) ? rawValue : [rawValue];
    for (const entry of entries) {
      if (typeof entry !== "string" || entry.trim().length === 0) {
        continue;
      }

      values.push({
        name,
        value: entry
      });
    }
  }

  return values;
}

function normalizeRecipientList(values?: string[]) {
  return (values ?? []).map((value) => value.trim()).filter(Boolean);
}

async function resolveConfiguredImapSettings(
  settings: Record<string, unknown>,
  options: {
    fetchImpl?: typeof fetch;
    signal?: AbortSignal;
  } = {}
) {
  const providerSettings = resolveSettingsObject(settings);
  const host = readRequiredString(providerSettings, "host");
  const username = readRequiredString(providerSettings, "username");
  const mailbox = readOptionalString(providerSettings, "mailbox") ?? "INBOX";
  const oauthSettings = readOptionalObject(providerSettings, "oauth");

  if (oauthSettings) {
    const tokens = await resolveOAuthAccessToken(
      {
        accessToken: readOptionalString(oauthSettings, "accessToken"),
        refreshToken: readOptionalString(oauthSettings, "refreshToken"),
        clientId: readOptionalString(oauthSettings, "clientId"),
        clientSecret: readOptionalString(oauthSettings, "clientSecret"),
        tokenEndpoint: readOptionalString(oauthSettings, "tokenEndpoint"),
        scope: readOptionalString(oauthSettings, "scope"),
        expiry: readOptionalString(oauthSettings, "expiry"),
        tokenType: readOptionalString(oauthSettings, "tokenType"),
        idToken: readOptionalString(oauthSettings, "idToken")
      },
      {
        fetchImpl: options.fetchImpl,
        signal: options.signal
      }
    );

    return {
      mailbox,
      config: {
        host,
        port: readOptionalNumber(providerSettings, "port") ?? 993,
        secure: readOptionalBoolean(providerSettings, "secure") ?? true,
        auth: {
          user: username,
          accessToken: tokens.accessToken
        }
      } satisfies ImapClientConfig
    };
  }

  const password = readRequiredString(providerSettings, "password");

  return {
    mailbox,
    config: {
      host,
      port: readOptionalNumber(providerSettings, "port") ?? 993,
      secure: readOptionalBoolean(providerSettings, "secure") ?? true,
      auth: {
        user: username,
        pass: password
      }
    } satisfies ImapClientConfig
  };
}

function resolveSettingsObject(settings: Record<string, unknown>) {
  const nested = settings.imap;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return nested as Record<string, unknown>;
  }

  return settings;
}

function readRequiredString(settings: Record<string, unknown>, key: string) {
  const value = readOptionalString(settings, key);
  if (!value) {
    throw new Error(`missing IMAP setting: ${key}`);
  }

  return value;
}

function readOptionalString(settings: Record<string, unknown>, key: string) {
  const value = settings[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readOptionalObject(settings: Record<string, unknown>, key: string) {
  const value = settings[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readOptionalNumber(settings: Record<string, unknown>, key: string) {
  const value = settings[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readOptionalBoolean(settings: Record<string, unknown>, key: string) {
  const value = settings[key];
  return typeof value === "boolean" ? value : undefined;
}

function createImapClient(config: ImapClientConfig): ImapClientLike {
  const client = new ImapFlow(config);

  return {
    connect() {
      return client.connect();
    },
    mailboxOpen(path: string) {
      return client.mailboxOpen(path);
    },
    fetch(range: string, query: Record<string, unknown>) {
      return client.fetch(range, query as never);
    },
    logout() {
      return client.logout();
    }
  };
}

function parseCheckpointUid(checkpoint?: string) {
  if (!checkpoint) {
    return 1;
  }

  const numeric = Number.parseInt(checkpoint, 10);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return 1;
  }

  return numeric + 1;
}

function readConfiguredUidValidity(settings: Record<string, unknown>) {
  const watch = settings.watch;
  if (!watch || typeof watch !== "object") {
    return undefined;
  }

  const raw = (watch as { uidValidity?: unknown }).uidValidity;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return String(raw);
  }
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : undefined;
}

function readMailboxUidValidity(mailbox: unknown) {
  if (!mailbox || typeof mailbox !== "object") {
    return undefined;
  }

  const raw = (mailbox as { uidValidity?: unknown; uidvalidity?: unknown }).uidValidity ??
    (mailbox as { uidValidity?: unknown; uidvalidity?: unknown }).uidvalidity;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return String(raw);
  }
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : undefined;
}

async function mapConfiguredImapFetchedMessage(fetched: ImapClientFetchedMessage) {
  const parsed = await parseImapSource(fetched.source);

  return {
    uid: String(fetched.uid),
    envelopeRecipients: normalizeRecipientList(parsed.envelopeRecipients),
    subject: parsed.subject ?? fetched.envelope?.subject,
    messageId: parsed.messageId,
    from: parsed.from ?? mapClientAddresses(fetched.envelope?.from),
    to: parsed.to ?? mapClientAddresses(fetched.envelope?.to),
    cc: parsed.cc ?? mapClientAddresses(fetched.envelope?.cc),
    bcc: parsed.bcc ?? mapClientAddresses(fetched.envelope?.bcc),
    replyTo: parsed.replyTo ?? mapClientAddresses(fetched.envelope?.replyTo),
    date: parsed.date ?? fetched.envelope?.date,
    headers: parsed.headers,
    text: parsed.text,
    html: parsed.html,
    attachments: parsed.attachments,
    raw: fetched.source ?? fetched
  } satisfies ImapFetchedMessage;
}

async function parseImapSource(source?: string | Uint8Array) {
  if (typeof source === "undefined") {
    return {};
  }

  try {
    const parsed = await simpleParser(normalizeRawSource(source));
    const headers = parseHeaderLines(parsed);
    return {
      envelopeRecipients: [
        ...readHeaderValues(headers, "Delivered-To"),
        ...readHeaderValues(headers, "X-Original-To")
      ],
      subject: parsed.subject ?? undefined,
      messageId: parsed.messageId ?? undefined,
      from: mapParsedAddresses(parsed.from),
      to: mapParsedAddresses(parsed.to),
      cc: mapParsedAddresses(parsed.cc),
      bcc: mapParsedAddresses(parsed.bcc),
      replyTo: mapParsedAddresses(parsed.replyTo),
      date: parsed.date ?? undefined,
      headers,
      text: normalizeParsedText(parsed.text),
      html: normalizeParsedText(parsed.html),
      attachments: mapParsedAttachments(parsed),
      raw: source
    };
  } catch {
    return {};
  }
}

function normalizeRawSource(source: string | Uint8Array) {
  return typeof source === "string" ? source : Buffer.from(source);
}

function parseHeaderLines(parsed: ParsedMail) {
  const headerLines = Array.isArray(parsed.headerLines)
    ? parsed.headerLines
    : [];

  const headers: Record<string, string | string[] | undefined> = {};
  for (const headerLine of headerLines) {
    const line = typeof headerLine.line === "string" ? headerLine.line : "";
    const separator = line.indexOf(":");
    if (separator < 0) {
      continue;
    }

    const name = line.slice(0, separator).trim() || headerLine.key;
    const value = line.slice(separator + 1).trim();
    if (!name || !value) {
      continue;
    }

    const existing = headers[name];
    if (typeof existing === "undefined") {
      headers[name] = value;
      continue;
    }

    headers[name] = Array.isArray(existing) ? [...existing, value] : [existing, value];
  }

  return headers;
}

function readHeaderValues(
  headers: Record<string, string | string[] | undefined>,
  name: string
) {
  const entry = Object.entries(headers).find(([headerName]) => headerName.toLowerCase() === name.toLowerCase());
  if (!entry) {
    return [];
  }

  const [, value] = entry;
  return (Array.isArray(value) ? value : [value]).filter(
    (headerValue): headerValue is string => typeof headerValue === "string" && headerValue.trim().length > 0
  );
}

function mapParsedAddresses(addresses?: AddressObject | AddressObject[] | null) {
  if (!addresses) {
    return undefined;
  }

  const objects = Array.isArray(addresses) ? addresses : [addresses];
  const mapped = objects.flatMap((addressObject) =>
    addressObject.value.map((entry) => ({
      name: entry.name ?? undefined,
      email: entry.address ?? ""
    }))
  ).filter((entry) => entry.email.length > 0);

  return mapped.length > 0 ? mapped : undefined;
}

function mapClientAddresses(addresses?: ImapClientFetchedEnvelopeAddress[]) {
  if (!addresses || addresses.length === 0) {
    return undefined;
  }

  const mapped = addresses
    .map((address) => ({
      name: address.name,
      email: address.address ?? ""
    }))
    .filter((address) => address.email.length > 0);

  return mapped.length > 0 ? mapped : undefined;
}

function normalizeParsedText(value: ParsedMail["text"] | ParsedMail["html"]) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function mapParsedAttachments(parsed: ParsedMail) {
  const attachments = Array.isArray(parsed.attachments) ? parsed.attachments : [];
  if (attachments.length === 0) {
    return undefined;
  }

  return attachments.map((attachment) => ({
    filename: attachment.filename ?? undefined,
    contentType: attachment.contentType,
    size: attachment.size,
    contentId: attachment.cid ?? undefined,
    disposition: attachment.contentDisposition ?? undefined,
    data: attachment.content
  })) satisfies ImapAttachment[];
}

async function* toAsyncIterable<T>(values: AsyncIterable<T> | Iterable<T>) {
  if (Symbol.asyncIterator in values) {
    yield* values as AsyncIterable<T>;
    return;
  }

  yield* values as Iterable<T>;
}
