import {
  createPkceCodeChallenge,
  createPkceCodeVerifier,
  createOAuthState,
  decodeJwtPayload,
  mapOAuthTokenSet,
  requestJson,
  type OAuthTokenSet
} from "./oauth-core.js";

export const DEFAULT_MICROSOFT_OAUTH_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "https://outlook.office.com/IMAP.AccessAsUser.All",
  "https://outlook.office.com/SMTP.Send"
] as const;

const MICROSOFT_AUTH_BASE = "https://login.microsoftonline.com";

export interface MicrosoftOAuthProfile {
  emailAddress: string;
  displayName?: string;
  tenantId?: string;
}

export interface MicrosoftOAuthClientLike {
  exchangeAuthorizationCode(input: {
    clientId: string;
    clientSecret?: string;
    code: string;
    redirectUri: string;
    codeVerifier: string;
    tenant?: string;
    signal?: AbortSignal;
  }): Promise<OAuthTokenSet>;
  refreshAccessToken(input: {
    clientId: string;
    clientSecret?: string;
    refreshToken: string;
    tenant?: string;
    signal?: AbortSignal;
  }): Promise<OAuthTokenSet>;
  getProfile(input: {
    idToken?: string;
    accessToken?: string;
  }): Promise<MicrosoftOAuthProfile>;
}

export interface MicrosoftOAuthAuthorizeUrlInput {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  scopes?: string[];
  loginHint?: string;
  tenant?: string;
}

export { createOAuthState, createPkceCodeChallenge, createPkceCodeVerifier };

export function buildMicrosoftOAuthAuthorizeUrl(input: MicrosoftOAuthAuthorizeUrlInput) {
  const url = new URL(buildMicrosoftAuthorizeEndpoint(input.tenant));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("scope", resolveScopeList(input.scopes).join(" "));
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (input.loginHint?.trim()) {
    url.searchParams.set("login_hint", input.loginHint.trim());
  }
  return url.toString();
}

export function buildMicrosoftTokenEndpoint(tenant?: string) {
  return `${MICROSOFT_AUTH_BASE}/${normalizeTenant(tenant)}/oauth2/v2.0/token`;
}

export function createMicrosoftOAuthClient(options: {
  fetchImpl?: typeof fetch;
} = {}): MicrosoftOAuthClientLike {
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

      const json = await requestJson(fetchImpl, buildMicrosoftTokenEndpoint(input.tenant), {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded"
        },
        body,
        signal: input.signal
      });
      return mapOAuthTokenSet(json);
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

      const json = await requestJson(fetchImpl, buildMicrosoftTokenEndpoint(input.tenant), {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded"
        },
        body,
        signal: input.signal
      });
      return mapOAuthTokenSet(json);
    },
    async getProfile(input) {
      const payload =
        decodeJwtPayload<Record<string, unknown>>(input.idToken) ??
        decodeJwtPayload<Record<string, unknown>>(input.accessToken);
      const emailAddress = firstString(payload?.email, payload?.preferred_username, payload?.upn, payload?.unique_name);
      if (!emailAddress) {
        throw new Error("microsoft oauth profile is missing an email address");
      }

      return {
        emailAddress,
        displayName: firstString(payload?.name),
        tenantId: firstString(payload?.tid)
      };
    }
  };
}

function buildMicrosoftAuthorizeEndpoint(tenant?: string) {
  return `${MICROSOFT_AUTH_BASE}/${normalizeTenant(tenant)}/oauth2/v2.0/authorize`;
}

function normalizeTenant(tenant?: string) {
  const value = tenant?.trim();
  return value && value.length > 0 ? value : "common";
}

function resolveScopeList(scopes?: string[]) {
  return scopes && scopes.length > 0 ? scopes : [...DEFAULT_MICROSOFT_OAUTH_SCOPES];
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}
