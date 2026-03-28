import {
  parseAuthenticationResults,
  type ParsedAuthenticationResults
} from "./auth-results.js";

export type MailTrustLevel = "T0" | "T1" | "T2" | "T3" | "T4";

export interface MailHeader {
  name: string;
  value: string;
}

export interface ResolveMailIdentityInput {
  from?: string;
  replyTo?: string[];
  sender?: string;
  headers: MailHeader[];
  allowDomains?: string[];
  internalDomains?: string[];
}

export interface MailIdentity {
  canonicalUserId: string;
  trustLevel: MailTrustLevel;
  fromAddress?: string;
  fromDomain?: string;
  replyTo: string[];
  authenticated: boolean;
  aligned: boolean;
  risks: string[];
  auth: ParsedAuthenticationResults;
}

const TRUST_LEVEL_ORDER: Record<MailTrustLevel, number> = {
  T0: 0,
  T1: 1,
  T2: 2,
  T3: 3,
  T4: 4
};

export function resolveMailIdentity(input: ResolveMailIdentityInput): MailIdentity {
  const fromAddress = normalizeEmail(input.from);
  const replyTo = normalizeEmails(input.replyTo);
  const sender = normalizeEmail(input.sender);
  const fromDomain = getDomain(fromAddress);
  const auth = parseAuthenticationHeaders(input.headers);
  const authenticated =
    auth.spf.result === "pass" || auth.dkim.result === "pass" || auth.dmarc.result === "pass";
  const aligned = auth.dmarc.result === "pass" && auth.dmarc.domain === fromDomain;
  const allowDomains = normalizeDomains(input.allowDomains);
  const internalDomains = normalizeDomains(input.internalDomains);
  const trustedDomain =
    !!fromDomain && (allowDomains.includes(fromDomain) || internalDomains.includes(fromDomain));
  const risks = collectRisks({
    authenticated,
    fromDomain,
    replyTo,
    sender
  });
  const trustLevel = resolveTrustLevel({
    authenticated,
    aligned,
    trustedDomain
  });
  const canonicalUserPrefix =
    trustLevel === "T2" || trustLevel === "T3" || trustLevel === "T4" ? "email" : "unverified";

  return {
    canonicalUserId: `${canonicalUserPrefix}:${fromAddress || "unknown"}`,
    trustLevel,
    fromAddress: fromAddress || undefined,
    fromDomain: fromDomain || undefined,
    replyTo,
    authenticated,
    aligned,
    risks,
    auth
  };
}

function parseAuthenticationHeaders(headers: MailHeader[]) {
  const authenticationResults = headers.filter(
    (header) => header.name.toLowerCase() === "authentication-results"
  );

  if (authenticationResults.length === 0) {
    return parseAuthenticationResults("");
  }

  return authenticationResults
    .map((header) => parseAuthenticationResults(header.value))
    .reduce(mergeAuthenticationResults);
}

function mergeAuthenticationResults(
  current: ParsedAuthenticationResults,
  next: ParsedAuthenticationResults
) {
  return {
    spf: pickAuthenticationResult(current.spf, next.spf),
    dkim: pickAuthenticationResult(current.dkim, next.dkim),
    dmarc: pickAuthenticationResult(current.dmarc, next.dmarc)
  };
}

function pickAuthenticationResult(left: { result: string; domain?: string }, right: {
  result: string;
  domain?: string;
}) {
  return scoreAuthenticationResult(right) > scoreAuthenticationResult(left) ? right : left;
}

function scoreAuthenticationResult(result: { result: string }) {
  switch (result.result) {
    case "pass":
      return 3;
    case "neutral":
    case "softfail":
      return 2;
    case "fail":
      return 1;
    default:
      return 0;
  }
}

function collectRisks(input: {
  authenticated: boolean;
  fromDomain: string;
  replyTo: string[];
  sender: string;
}) {
  const risks: string[] = [];

  if (!input.authenticated) {
    risks.push("unauthenticated");
  }

  if (
    input.replyTo.some((entry) => {
      const domain = getDomain(entry);
      return !!domain && !!input.fromDomain && domain !== input.fromDomain;
    })
  ) {
    risks.push("reply_to_domain_mismatch");
  }

  const senderDomain = getDomain(input.sender);
  if (senderDomain && input.fromDomain && senderDomain !== input.fromDomain) {
    risks.push("sender_domain_mismatch");
  }

  return risks;
}

function resolveTrustLevel(input: {
  authenticated: boolean;
  aligned: boolean;
  trustedDomain: boolean;
}): MailTrustLevel {
  if (input.aligned && input.trustedDomain) {
    return "T3";
  }

  if (input.aligned) {
    return "T2";
  }

  if (input.authenticated) {
    return "T1";
  }

  return "T0";
}

export function meetsMinimumTrustLevel(actual: MailTrustLevel, minimum: MailTrustLevel) {
  return TRUST_LEVEL_ORDER[actual] >= TRUST_LEVEL_ORDER[minimum];
}

function normalizeEmail(value?: string) {
  return value?.trim().toLowerCase() ?? "";
}

function normalizeEmails(values?: string[]) {
  return (values ?? []).map((value) => normalizeEmail(value)).filter(Boolean);
}

function normalizeDomains(values?: string[]) {
  return (values ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean);
}

function getDomain(email: string) {
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) {
    return "";
  }

  return email.slice(at + 1);
}
