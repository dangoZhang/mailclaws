import { createHash, randomBytes } from "node:crypto";

export const DEFAULT_GMAIL_OAUTH_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send"
] as const;

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GMAIL_PROFILE_ENDPOINT = "https://gmail.googleapis.com/gmail/v1/users/me/profile";

export interface GmailOAuthTokenSet {
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;
  scope?: string;
  expiresAt?: string;
  idToken?: string;
}

export interface GmailOAuthProfile {
  emailAddress: string;
  historyId?: string;
}

export interface GmailOAuthClientLike {
  exchangeAuthorizationCode(input: {
    clientId: string;
    clientSecret?: string;
    code: string;
    redirectUri: string;
    codeVerifier: string;
    signal?: AbortSignal;
  }): Promise<GmailOAuthTokenSet>;
  refreshAccessToken(input: {
    clientId: string;
    clientSecret?: string;
    refreshToken: string;
    signal?: AbortSignal;
  }): Promise<GmailOAuthTokenSet>;
  getProfile(input: { accessToken: string; signal?: AbortSignal }): Promise<GmailOAuthProfile>;
}

export interface GmailOAuthAuthorizeUrlInput {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  scopes?: string[];
  loginHint?: string;
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

export function buildGmailOAuthAuthorizeUrl(input: GmailOAuthAuthorizeUrlInput) {
  const url = new URL(GOOGLE_AUTH_ENDPOINT);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("scope", resolveScopeList(input.scopes).join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (input.loginHint?.trim()) {
    url.searchParams.set("login_hint", input.loginHint.trim());
  }
  return url.toString();
}

export function createGmailOAuthClient(options: {
  fetchImpl?: typeof fetch;
} = {}): GmailOAuthClientLike {
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async exchangeAuthorizationCode(input) {
      const body = new URLSearchParams({
        code: input.code,
        client_id: input.clientId,
        code_verifier: input.codeVerifier,
        grant_type: "authorization_code",
        redirect_uri: input.redirectUri
      });
      if (input.clientSecret?.trim()) {
        body.set("client_secret", input.clientSecret.trim());
      }

      const json = await requestJson(fetchImpl, GOOGLE_TOKEN_ENDPOINT, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded"
        },
        body,
        signal: input.signal
      });
      return mapTokenSet(json);
    },
    async refreshAccessToken(input) {
      const body = new URLSearchParams({
        client_id: input.clientId,
        grant_type: "refresh_token",
        refresh_token: input.refreshToken
      });
      if (input.clientSecret?.trim()) {
        body.set("client_secret", input.clientSecret.trim());
      }

      const json = await requestJson(fetchImpl, GOOGLE_TOKEN_ENDPOINT, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded"
        },
        body,
        signal: input.signal
      });
      return mapTokenSet(json);
    },
    async getProfile(input) {
      const json = await requestJson(fetchImpl, GMAIL_PROFILE_ENDPOINT, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${input.accessToken}`
        },
        signal: input.signal
      });

      if (typeof json.emailAddress !== "string" || json.emailAddress.trim().length === 0) {
        throw new Error("gmail oauth profile response is missing emailAddress");
      }

      return {
        emailAddress: json.emailAddress.trim(),
        historyId: typeof json.historyId === "string" ? json.historyId : undefined
      };
    }
  };
}

export function renderGmailOAuthCallbackHtml(input: {
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
    </main>
  </body>
</html>`;
}

function resolveScopeList(scopes?: string[]) {
  return scopes && scopes.length > 0 ? scopes : [...DEFAULT_GMAIL_OAUTH_SCOPES];
}

async function requestJson(
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

function mapTokenSet(record: Record<string, unknown>): GmailOAuthTokenSet {
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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
