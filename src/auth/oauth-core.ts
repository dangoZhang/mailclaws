import { createHash, randomBytes } from "node:crypto";

export interface OAuthTokenSet {
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;
  scope?: string;
  expiresAt?: string;
  idToken?: string;
}

export interface OAuthAccessTokenSettings {
  accessToken?: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  tokenEndpoint?: string;
  scope?: string;
  expiry?: string;
  tokenType?: string;
  idToken?: string;
}

export function createPkceCodeVerifier() {
  return randomBytes(32).toString("base64url");
}

export function createPkceCodeChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function createOAuthState() {
  return randomBytes(24).toString("base64url");
}

export async function refreshOAuthAccessToken(
  settings: OAuthAccessTokenSettings,
  options: {
    fetchImpl?: typeof fetch;
    signal?: AbortSignal;
  } = {}
) {
  if (!settings.tokenEndpoint?.trim()) {
    throw new Error("missing oauth setting: tokenEndpoint");
  }
  if (!settings.clientId?.trim()) {
    throw new Error("missing oauth setting: clientId");
  }
  if (!settings.refreshToken?.trim()) {
    throw new Error("missing oauth setting: refreshToken");
  }

  const body = new URLSearchParams({
    client_id: settings.clientId.trim(),
    grant_type: "refresh_token",
    refresh_token: settings.refreshToken.trim()
  });
  if (settings.clientSecret?.trim()) {
    body.set("client_secret", settings.clientSecret.trim());
  }
  if (settings.scope?.trim()) {
    body.set("scope", settings.scope.trim());
  }

  const json = await requestJson(options.fetchImpl ?? fetch, settings.tokenEndpoint.trim(), {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body,
    signal: options.signal
  });

  return mapOAuthTokenSet(json);
}

export async function resolveOAuthAccessToken(
  settings: OAuthAccessTokenSettings,
  options: {
    fetchImpl?: typeof fetch;
    signal?: AbortSignal;
    expirySkewMs?: number;
  } = {}
) {
  const expirySkewMs = options.expirySkewMs ?? 60_000;
  const accessToken = normalizeOptionalString(settings.accessToken);
  const expiresAt = normalizeOptionalString(settings.expiry);

  if (accessToken && (!expiresAt || Date.parse(expiresAt) > Date.now() + expirySkewMs)) {
    return {
      accessToken,
      refreshToken: normalizeOptionalString(settings.refreshToken),
      tokenType: normalizeOptionalString(settings.tokenType),
      scope: normalizeOptionalString(settings.scope),
      expiresAt,
      idToken: normalizeOptionalString(settings.idToken)
    } satisfies OAuthTokenSet;
  }

  return refreshOAuthAccessToken(settings, options);
}

export function renderOAuthCallbackHtml(input: {
  providerName: string;
  success: boolean;
  title: string;
  message: string;
  accountId?: string;
  emailAddress?: string;
}) {
  const details = [
    input.accountId ? `<p><strong>Account ID:</strong> ${escapeHtml(input.accountId)}</p>` : "",
    input.emailAddress ? `<p><strong>Email:</strong> ${escapeHtml(input.emailAddress)}</p>` : ""
  ]
    .filter(Boolean)
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(input.title)}</title>
    <style>
      body {
        margin: 0;
        font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: linear-gradient(180deg, #f3f7fb 0%, #edf3ea 100%);
        color: #17212b;
      }
      main {
        max-width: 560px;
        margin: 10vh auto;
        padding: 32px 28px;
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.94);
        box-shadow: 0 18px 60px rgba(23, 33, 43, 0.14);
      }
      h1 {
        margin: 0 0 12px;
        font-size: 28px;
      }
      p {
        margin: 10px 0;
        line-height: 1.5;
      }
      .status {
        display: inline-block;
        margin-bottom: 16px;
        padding: 6px 10px;
        border-radius: 999px;
        font-size: 13px;
        font-weight: 600;
        background: ${input.success ? "#dff4e5" : "#fde7e7"};
        color: ${input.success ? "#1d6b3f" : "#9a2f2f"};
      }
    </style>
  </head>
  <body>
    <main>
      <div class="status">${input.success ? "Connected" : "Failed"}</div>
      <h1>${escapeHtml(input.title)}</h1>
      <p>${escapeHtml(input.message)}</p>
      ${details}
      <p>You can close this window and return to MailClaws.</p>
      <p><small>Provider: ${escapeHtml(input.providerName)}</small></p>
    </main>
  </body>
</html>`;
}

export function decodeJwtPayload<T extends Record<string, unknown>>(token: string | undefined) {
  if (!token) {
    return null;
  }

  const segments = token.split(".");
  if (segments.length < 2) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(segments[1]!, "base64url").toString("utf8")) as unknown;
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      return payload as T;
    }
  } catch {
    return null;
  }

  return null;
}

export async function requestJson(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit
): Promise<Record<string, unknown>> {
  const response = await fetchImpl(url, init);
  const text = await response.text();
  const json = text.trim() ? (JSON.parse(text) as unknown) : {};
  const record =
    json && typeof json === "object" && !Array.isArray(json) ? (json as Record<string, unknown>) : {};

  if (!response.ok) {
    const errorDescription = readErrorDescription(record);
    const error = new Error(
      `${url} failed: ${response.status} ${response.statusText}${errorDescription ? ` - ${errorDescription}` : ""}`
    ) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  return record;
}

export function mapOAuthTokenSet(record: Record<string, unknown>): OAuthTokenSet {
  if (typeof record.access_token !== "string" || record.access_token.trim().length === 0) {
    throw new Error("oauth token response is missing access_token");
  }

  const expiresInSeconds =
    typeof record.expires_in === "number"
      ? record.expires_in
      : typeof record.expires_in === "string"
        ? Number.parseInt(record.expires_in, 10)
        : undefined;

  return {
    accessToken: record.access_token.trim(),
    refreshToken: typeof record.refresh_token === "string" ? record.refresh_token.trim() : undefined,
    tokenType: typeof record.token_type === "string" ? record.token_type.trim() : undefined,
    scope: typeof record.scope === "string" ? record.scope.trim() : undefined,
    expiresAt:
      typeof expiresInSeconds === "number" && Number.isFinite(expiresInSeconds)
        ? new Date(Date.now() + expiresInSeconds * 1000).toISOString()
        : undefined,
    idToken: typeof record.id_token === "string" ? record.id_token.trim() : undefined
  };
}

function readErrorDescription(record: Record<string, unknown>) {
  if (typeof record.error_description === "string" && record.error_description.trim().length > 0) {
    return record.error_description.trim();
  }

  const nestedError =
    record.error && typeof record.error === "object" && !Array.isArray(record.error)
      ? (record.error as Record<string, unknown>)
      : null;
  if (nestedError && typeof nestedError.message === "string" && nestedError.message.trim().length > 0) {
    return nestedError.message.trim();
  }

  if (typeof record.error === "string" && record.error.trim().length > 0) {
    return record.error.trim();
  }

  return "";
}

function normalizeOptionalString(value: string | undefined) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
