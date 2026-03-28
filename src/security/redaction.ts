const SENSITIVE_KEY_PATTERN =
  /(oauth(access|refresh)?token|token|password|pass|secret|client[_ -]?secret|authorization|api[_ -]?key|credential)/i;

export function isSensitiveKey(key: string) {
  return SENSITIVE_KEY_PATTERN.test(key);
}

export function redactSensitiveText(message: string) {
  return message
    .replace(
      /(oauth(access|refresh)?token|token|password|pass|secret|client[_ -]?secret|authorization|api[_ -]?key|credential)\s*[:=]\s*([^\s,;]+)/gi,
      (_match, key) => `${String(key)}=[redacted]`
    )
    .replace(/\bBearer\s+[A-Za-z0-9._-]+/gi, "Bearer=[redacted]");
}

export function redactSensitiveValue(value: unknown): unknown {
  if (typeof value === "string") {
    return redactSensitiveText(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactSensitiveValue(entry));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    output[key] = isSensitiveKey(key) ? "[redacted]" : redactSensitiveValue(entry);
  }
  return output;
}
