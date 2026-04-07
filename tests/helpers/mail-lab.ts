import { Buffer } from "node:buffer";

import type {
  ProviderAddress,
  ProviderAttachment,
  ProviderHeader,
  ProviderMailEnvelope
} from "../../src/providers/types.js";

export const TEST_MAILBOXES = {
  assistant: "assistant@acme.ai",
  research: "research@acme.ai",
  assistantVip: "assistant+vip@acme.ai",
  ops: "ops@acme.ai",
  customerA: "customer-a@example.com",
  customerB: "customer-b@example.com"
} as const;

interface MailLabEnvelopeInput {
  providerMessageId?: string;
  threadId?: string;
  messageId?: string;
  subject: string;
  from?: ProviderAddress;
  to?: ProviderAddress[];
  cc?: ProviderAddress[];
  bcc?: ProviderAddress[];
  replyTo?: ProviderAddress[];
  text?: string;
  date?: string;
  headers?: ProviderHeader[];
  attachments?: ProviderAttachment[];
  envelopeRecipients?: string[];
  rawMime?: string;
}

export interface MailLabEnvelope extends ProviderMailEnvelope {
  messageId: string;
  headers: ProviderHeader[];
}

export function createMailLab(seed = "mail-lab") {
  let nextSequence = 1;

  const nextId = (kind: "provider" | "message") => {
    const sequence = nextSequence++;
    return kind === "provider" ? `${seed}-${sequence}` : `<${seed}-${sequence}@example.test>`;
  };

  const buildEnvelope = (input: MailLabEnvelopeInput): MailLabEnvelope => {
    const messageId = input.messageId ?? nextId("message");
    const providerMessageId = input.providerMessageId ?? nextId("provider");
    const from = input.from ?? {
      email: TEST_MAILBOXES.customerA
    };
    const to = input.to ?? [{ email: TEST_MAILBOXES.assistant }];
    const date = input.date ?? "2026-03-26T00:00:00.000Z";

    const headers = buildHeaders({
      messageId,
      subject: input.subject,
      from,
      to,
      cc: input.cc,
      bcc: input.bcc,
      replyTo: input.replyTo,
      date,
      headers: input.headers
    });

    return {
      providerMessageId,
      threadId: input.threadId,
      messageId,
      envelopeRecipients: input.envelopeRecipients ?? to.map((entry) => entry.email),
      subject: input.subject,
      from,
      to,
      cc: input.cc,
      bcc: input.bcc,
      replyTo: input.replyTo,
      text: input.text ?? "",
      date,
      headers,
      attachments: input.attachments ?? [],
      rawMime:
        input.rawMime ??
        buildRawMime({
          headers,
          text: input.text ?? "",
          attachments: input.attachments ?? []
        })
    };
  };

  return {
    addresses: TEST_MAILBOXES,
    newMail(input: MailLabEnvelopeInput) {
      return buildEnvelope(input);
    },
    reply(
      parent: Pick<MailLabEnvelope, "messageId" | "subject" | "from" | "to" | "headers">,
      input: Omit<MailLabEnvelopeInput, "subject"> & { subject?: string } = {}
    ) {
      const inheritedReferences = extractReferences(parent.headers);
      const replySubject =
        input.subject ??
        (parent.subject.toLowerCase().startsWith("re:") ? parent.subject : `Re: ${parent.subject}`);
      return buildEnvelope({
        ...input,
        subject: replySubject,
        to: input.to ?? [parent.from],
        headers: [
          {
            name: "In-Reply-To",
            value: parent.messageId
          },
          {
            name: "References",
            value: [...inheritedReferences, parent.messageId].join(" ")
          },
          ...(input.headers ?? [])
        ]
      });
    }
  };
}

function buildHeaders(input: {
  messageId: string;
  subject: string;
  from: ProviderAddress;
  to: ProviderAddress[];
  cc?: ProviderAddress[];
  bcc?: ProviderAddress[];
  replyTo?: ProviderAddress[];
  date: string;
  headers?: ProviderHeader[];
}) {
  const headers: ProviderHeader[] = [
    { name: "Message-ID", value: input.messageId },
    { name: "Date", value: new Date(input.date).toUTCString() },
    { name: "From", value: formatAddresses([input.from]) },
    { name: "To", value: formatAddresses(input.to) },
    { name: "Subject", value: input.subject }
  ];

  if (input.cc && input.cc.length > 0) {
    headers.push({ name: "Cc", value: formatAddresses(input.cc) });
  }
  if (input.bcc && input.bcc.length > 0) {
    headers.push({ name: "Bcc", value: formatAddresses(input.bcc) });
  }
  if (input.replyTo && input.replyTo.length > 0) {
    headers.push({ name: "Reply-To", value: formatAddresses(input.replyTo) });
  }

  return [...headers, ...(input.headers ?? [])];
}

function formatAddresses(addresses: ProviderAddress[]) {
  return addresses
    .map((entry) => (entry.name ? `"${entry.name}" <${entry.email}>` : entry.email))
    .join(", ");
}

function buildRawMime(input: {
  headers: ProviderHeader[];
  text: string;
  attachments: ProviderAttachment[];
}) {
  if (input.attachments.length === 0) {
    return [
      ...input.headers.map((header) => `${header.name}: ${header.value}`),
      "MIME-Version: 1.0",
      'Content-Type: text/plain; charset="utf-8"',
      "",
      input.text,
      ""
    ].join("\r\n");
  }

  const boundary = "mailclaws-boundary";
  const parts = [
    ...input.headers.map((header) => `${header.name}: ${header.value}`),
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="utf-8"',
    "",
    input.text,
    ""
  ];

  for (const attachment of input.attachments) {
    const rawData =
      typeof attachment.data === "string"
        ? Buffer.from(attachment.data, "utf8")
        : attachment.data
          ? Buffer.from(attachment.data)
          : Buffer.from("");
    parts.push(
      `--${boundary}`,
      `Content-Type: ${attachment.mimeType ?? "application/octet-stream"}; name="${attachment.filename ?? "attachment.bin"}"`,
      `Content-Disposition: ${attachment.disposition ?? "attachment"}; filename="${attachment.filename ?? "attachment.bin"}"`,
      "Content-Transfer-Encoding: base64",
      "",
      rawData.toString("base64"),
      ""
    );
  }

  parts.push(`--${boundary}--`, "");
  return parts.join("\r\n");
}

function extractReferences(headers: ProviderHeader[]) {
  const references = headers.find((header) => header.name.toLowerCase() === "references")?.value;
  return references ? references.split(/\s+/).filter(Boolean) : [];
}
