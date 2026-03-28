import { createHash } from "node:crypto";

export function toSafeStoragePathSegment(value: string, fallback = "artifact") {
  const trimmed = value.trim();
  const sanitized = trimmed
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (sanitized && sanitized !== "." && sanitized !== ".." && sanitized === trimmed) {
    return sanitized;
  }

  const base = sanitized && sanitized !== "." && sanitized !== ".." ? sanitized : fallback;
  const digest = createHash("sha256").update(trimmed).digest("hex").slice(0, 8);
  return `${base.slice(0, 80)}-${digest}`;
}

export function toSafeStorageFileName(id: string, extension: string, fallback = "artifact") {
  const normalizedExtension = extension.startsWith(".") ? extension : `.${extension}`;
  return `${toSafeStoragePathSegment(id, fallback)}${normalizedExtension}`;
}
