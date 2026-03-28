import fs from "node:fs";

import type {
  MailTurnAttachmentDescriptor,
  MailTurnExecutionPolicy,
  MailTurnMemoryNamespaces
} from "../core/types.js";

const MAX_OPENCLAW_INLINE_ATTACHMENT_BYTES = 2 * 1024 * 1024;

export interface OpenClawResponsesRequestInput {
  baseUrl: string;
  agentId: string;
  sessionKey: string;
  inputText: string;
  sessionHeaders?: Record<string, string>;
  sessionMetadata?: Record<string, string>;
  attachments?: MailTurnAttachmentDescriptor[];
  memoryNamespaces?: MailTurnMemoryNamespaces;
  executionPolicy?: MailTurnExecutionPolicy;
  model?: string;
  gatewayToken?: string;
}

export interface OpenClawResponsesRequest {
  url: string;
  method: "POST";
  headers: Record<string, string>;
  body: string;
}

export function buildOpenClawResponsesUrl(baseUrl: string) {
  return new URL("/v1/responses", baseUrl).toString();
}

export function buildOpenClawResponsesRequest(
  input: OpenClawResponsesRequestInput
): OpenClawResponsesRequest {
  const headers: Record<string, string> = {
    ...(input.sessionHeaders ?? {}),
    "Content-Type": "application/json",
    "x-openclaw-agent-id": input.agentId,
    "x-openclaw-session-key": input.sessionKey
  };

  if (input.gatewayToken) {
    headers.Authorization = `Bearer ${input.gatewayToken}`;
  }

  const metadata = buildMailClawMetadata(input);
  const content = [
    {
      type: "input_text",
      text: input.inputText
    },
    ...buildOpenClawAttachmentInputs(input.attachments)
  ];

  return {
    url: buildOpenClawResponsesUrl(input.baseUrl),
    method: "POST",
    headers,
    body: JSON.stringify({
      model: input.model ?? `openclaw:${input.agentId}`,
      stream: true,
      ...(metadata ? { metadata } : {}),
      input: [
        {
          role: "user",
          content
        }
      ]
    })
  };
}

function buildMailClawMetadata(input: OpenClawResponsesRequestInput) {
  const metadata: Record<string, string> = {
    ...(input.sessionMetadata ?? {})
  };

  if (input.memoryNamespaces) {
    metadata.mailclaw_memory_namespaces = JSON.stringify(input.memoryNamespaces);
  }

  if (input.executionPolicy) {
    metadata.mailclaw_execution_policy = JSON.stringify(input.executionPolicy);
  }

  if (input.attachments?.length) {
    metadata.mailclaw_turn_attachments = JSON.stringify(input.attachments);
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function buildOpenClawAttachmentInputs(attachments?: MailTurnAttachmentDescriptor[]) {
  if (!attachments?.length) {
    return [];
  }

  return attachments.flatMap((attachment) => {
    const payload = buildOpenClawAttachmentInput(attachment);
    return payload ? [payload] : [];
  });
}

function buildOpenClawAttachmentInput(attachment: MailTurnAttachmentDescriptor) {
  const inputPath = attachment.preferredInputPath;
  if (!inputPath || !fs.existsSync(inputPath)) {
    return null;
  }

  const fileBuffer = fs.readFileSync(inputPath);
  if (fileBuffer.byteLength > MAX_OPENCLAW_INLINE_ATTACHMENT_BYTES) {
    return null;
  }

  return {
    type: "input_file",
    filename: attachment.preferredInputFilename ?? attachment.filename,
    file_data: `data:${attachment.preferredInputMimeType ?? attachment.mimeType};base64,${fileBuffer.toString("base64")}`
  };
}

export function parseOpenClawSseStream(source: string) {
  const chunks: string[] = [];
  const events = source.split(/\n\n+/);

  for (const event of events) {
    const dataLines = event
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trim());

    for (const dataLine of dataLines) {
      if (!dataLine) {
        continue;
      }

      try {
        const payload = JSON.parse(dataLine) as unknown;
        const extracted = extractSseText(payload);
        if (extracted) {
          chunks.push(extracted);
        }
      } catch {
        continue;
      }
    }
  }

  return chunks;
}

export function extractOpenClawResponseText(chunks: string[]) {
  return chunks.join("");
}

function extractSseText(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const record = payload as Record<string, unknown>;

  if (record.type === "response.output_text.delta" && typeof record.delta === "string") {
    return record.delta;
  }

  if (record.type === "response.output_text.done" && typeof record.text === "string") {
    return record.text;
  }

  if (record.type === "response.completed") {
    return extractTextFromResponse(record.response);
  }

  if (typeof record.text === "string") {
    return record.text;
  }

  return extractTextFromResponse(record.output);
}

function extractTextFromResponse(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    const parts = value
      .map((entry) => extractTextFromResponse(entry))
      .filter((part): part is string => typeof part === "string" && part.length > 0);

    return parts.length > 0 ? parts.join("") : null;
  }

  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;

  if (typeof record.text === "string") {
    return record.text;
  }

  if (record.type === "output_text" && typeof record.text === "string") {
    return record.text;
  }

  if (Array.isArray(record.content)) {
    const parts = record.content
      .map((entry) => extractTextFromResponse(entry))
      .filter((part): part is string => typeof part === "string" && part.length > 0);

    return parts.length > 0 ? parts.join("") : null;
  }

  if (Array.isArray(record.output)) {
    const parts = record.output
      .map((entry) => extractTextFromResponse(entry))
      .filter((part): part is string => typeof part === "string" && part.length > 0);

    return parts.length > 0 ? parts.join("") : null;
  }

  return null;
}
