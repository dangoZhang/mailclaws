import { createHash } from "node:crypto";

import { simpleParser, type AddressObject, type ParsedMail } from "mailparser";

import type {
  ProviderAddress,
  ProviderAttachment,
  ProviderHeader,
  ProviderMailEnvelope
} from "./types.js";

export interface ParseRawMimeEnvelopeInput {
  rawMime: string | Uint8Array;
  providerMessageId?: string;
  threadId?: string;
  envelopeRecipients?: string[];
  fallbackMailboxAddress?: string;
}

export async function parseRawMimeEnvelope(
  input: ParseRawMimeEnvelopeInput
): Promise<ProviderMailEnvelope> {
  const parsed = await simpleParser(normalizeRawSource(input.rawMime));
  const headers = parseHeaderLines(parsed);
  const deliveredTo = [
    ...readHeaderValues(headers, "Delivered-To"),
    ...readHeaderValues(headers, "X-Original-To")
  ];
  const to = mapParsedAddresses(parsed.to) ?? fallbackMailboxAddressList(input.fallbackMailboxAddress);
  const from = firstParsedAddress(parsed.from) ?? {
    email: readHeaderAddressFallback(headers, "From") ?? "unknown@invalid.local"
  };

  return {
    providerMessageId: resolveProviderMessageId(input.providerMessageId, input.rawMime),
    threadId: input.threadId,
    messageId: parsed.messageId ?? undefined,
    envelopeRecipients: dedupeRecipients([
      ...(input.envelopeRecipients ?? []),
      ...deliveredTo,
      ...(input.fallbackMailboxAddress ? [input.fallbackMailboxAddress] : []),
      ...to.map((entry) => entry.email)
    ]),
    subject: parsed.subject ?? "",
    from,
    to,
    cc: mapParsedAddresses(parsed.cc),
    bcc: mapParsedAddresses(parsed.bcc),
    replyTo: mapParsedAddresses(parsed.replyTo),
    date: parsed.date ?? undefined,
    headers,
    text: normalizeParsedText(parsed.text),
    html: normalizeParsedText(parsed.html),
    attachments: mapParsedAttachments(parsed),
    rawMime: typeof input.rawMime === "string" ? input.rawMime : Buffer.from(input.rawMime).toString("utf8"),
    raw: input.rawMime
  };
}

function resolveProviderMessageId(providerMessageId: string | undefined, rawMime: string | Uint8Array) {
  if (typeof providerMessageId === "string" && providerMessageId.trim().length > 0) {
    return providerMessageId.trim();
  }

  return `raw:${createHash("sha256").update(normalizeRawSource(rawMime)).digest("hex").slice(0, 24)}`;
}

function normalizeRawSource(source: string | Uint8Array) {
  return typeof source === "string" ? source : Buffer.from(source);
}

function parseHeaderLines(parsed: ParsedMail): ProviderHeader[] {
  const headerLines = Array.isArray(parsed.headerLines) ? parsed.headerLines : [];
  const headers: ProviderHeader[] = [];

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

    headers.push({
      name,
      value
    });
  }

  return headers;
}

function readHeaderValues(headers: ProviderHeader[], name: string) {
  return headers
    .filter((header) => header.name.toLowerCase() === name.toLowerCase())
    .map((header) => header.value)
    .filter((value) => value.trim().length > 0);
}

function readHeaderAddressFallback(headers: ProviderHeader[], name: string) {
  const value = readHeaderValues(headers, name)[0];
  if (!value) {
    return undefined;
  }

  const match = value.match(/<([^>]+)>/);
  if (match?.[1]) {
    return match[1].trim().toLowerCase();
  }

  const plain = value.split(",")[0]?.trim();
  return plain && plain.includes("@") ? plain.replace(/^"+|"+$/g, "").toLowerCase() : undefined;
}

function mapParsedAddresses(addresses?: AddressObject | AddressObject[] | null) {
  if (!addresses) {
    return undefined;
  }

  const objects = Array.isArray(addresses) ? addresses : [addresses];
  const mapped = objects
    .flatMap((addressObject) =>
      addressObject.value.map((entry) => ({
        name: entry.name ?? undefined,
        email: entry.address ?? ""
      }))
    )
    .filter((entry) => entry.email.length > 0);

  return mapped.length > 0 ? mapped : undefined;
}

function firstParsedAddress(addresses?: AddressObject | AddressObject[] | null): ProviderAddress | undefined {
  return mapParsedAddresses(addresses)?.[0];
}

function fallbackMailboxAddressList(fallbackMailboxAddress?: string): ProviderAddress[] {
  if (!fallbackMailboxAddress) {
    return [];
  }

  return [
    {
      email: fallbackMailboxAddress
    }
  ];
}

function normalizeParsedText(value: ParsedMail["text"] | ParsedMail["html"]) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function mapParsedAttachments(parsed: ParsedMail): ProviderAttachment[] | undefined {
  const attachments = Array.isArray(parsed.attachments) ? parsed.attachments : [];
  if (attachments.length === 0) {
    return undefined;
  }

  return attachments.map((attachment) => ({
    filename: attachment.filename ?? undefined,
    mimeType: attachment.contentType,
    size: attachment.size,
    contentId: attachment.cid ?? undefined,
    disposition: attachment.contentDisposition ?? undefined,
    data: attachment.content
  }));
}

function dedupeRecipients(values: string[]) {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of values) {
    const email = value.trim().toLowerCase();
    if (!email || seen.has(email)) {
      continue;
    }
    seen.add(email);
    normalized.push(email);
  }

  return normalized;
}
