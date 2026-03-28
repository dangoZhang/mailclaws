export interface SenderPolicyConfig {
  allowEmails?: string[];
  allowDomains?: string[];
  denyEmails?: string[];
  denyDomains?: string[];
}

export interface SenderPolicyInput {
  from: string;
  config?: SenderPolicyConfig;
}

export interface SenderPolicyResult {
  allowed: boolean;
  reason: string;
  matchedRule?: string;
}

export function evaluateSenderPolicy(input: SenderPolicyInput): SenderPolicyResult {
  const config = normalizeSenderPolicyConfig(input.config);
  const sender = normalizeEmailAddress(input.from);
  const domain = extractDomain(sender);

  if (!sender || !domain) {
    return {
      allowed: false,
      reason: "invalid sender"
    };
  }

  const denyRule = matchSender(sender, domain, config.denyEmails, config.denyDomains);
  if (denyRule) {
    return {
      allowed: false,
      reason: `denylist:${denyRule}`,
      matchedRule: denyRule
    };
  }

  const allowRulesConfigured = config.allowEmails.length > 0 || config.allowDomains.length > 0;
  const allowRule = matchSender(sender, domain, config.allowEmails, config.allowDomains);
  if (allowRulesConfigured && !allowRule) {
    return {
      allowed: false,
      reason: "sender not present in allowlist"
    };
  }

  return {
    allowed: true,
    reason: allowRule ? `allowlist:${allowRule}` : "allowed by default",
    matchedRule: allowRule
  };
}

function normalizeSenderPolicyConfig(config?: SenderPolicyConfig) {
  return {
    allowEmails: normalizeStrings(config?.allowEmails),
    allowDomains: normalizeStrings(config?.allowDomains),
    denyEmails: normalizeStrings(config?.denyEmails),
    denyDomains: normalizeStrings(config?.denyDomains)
  };
}

function normalizeStrings(values?: string[]) {
  return (values ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean);
}

function normalizeEmailAddress(value: string) {
  return value.trim().toLowerCase();
}

function extractDomain(email: string) {
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) {
    return "";
  }

  return email.slice(at + 1);
}

function matchSender(
  sender: string,
  domain: string,
  emails: string[],
  domains: string[]
) {
  if (emails.includes(sender)) {
    return sender;
  }

  if (domains.includes(domain)) {
    return domain;
  }

  return "";
}
