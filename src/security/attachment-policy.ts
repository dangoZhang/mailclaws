export interface AttachmentDescriptor {
  filename: string;
  contentType: string;
  sizeBytes: number;
}

export interface AttachmentPolicyConfig {
  maxAttachments?: number;
  maxAttachmentBytes?: number;
  allowedMimeTypes?: string[];
}

export interface AttachmentPolicyInput {
  attachments: AttachmentDescriptor[];
  config?: AttachmentPolicyConfig;
}

export interface AttachmentPolicyResult {
  allowed: boolean;
  reasons: string[];
}

export function evaluateAttachmentPolicy(input: AttachmentPolicyInput): AttachmentPolicyResult {
  const config = normalizeAttachmentPolicyConfig(input.config);
  const reasons = new Set<string>();

  if (input.attachments.length > config.maxAttachments) {
    reasons.add("attachment-count");
  }

  for (const attachment of input.attachments) {
    if (attachment.sizeBytes > config.maxAttachmentBytes) {
      reasons.add(`size:${attachment.filename}`);
    }

    if (
      config.allowedMimeTypes.length > 0 &&
      !config.allowedMimeTypes.includes(attachment.contentType.trim().toLowerCase())
    ) {
      reasons.add(`mime:${attachment.filename}`);
    }
  }

  return {
    allowed: reasons.size === 0,
    reasons: [...reasons]
  };
}

function normalizeAttachmentPolicyConfig(config?: AttachmentPolicyConfig) {
  return {
    maxAttachments: config?.maxAttachments ?? 5,
    maxAttachmentBytes: config?.maxAttachmentBytes ?? 20 * 1024 * 1024,
    allowedMimeTypes: normalizeStrings(config?.allowedMimeTypes)
  };
}

function normalizeStrings(values?: string[]) {
  return (values ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean);
}
