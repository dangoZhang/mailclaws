import type { WorkerRole } from "../core/types.js";
import type { NormalizedMailEnvelope } from "../providers/types.js";
import type { MailAccountRecord } from "../storage/repositories/mail-accounts.js";

const ROLE_ALIAS_ENTRIES = [
  ["attachment", "mail-attachment-reader"],
  ["attachment-reader", "mail-attachment-reader"],
  ["research", "mail-researcher"],
  ["researcher", "mail-researcher"],
  ["draft", "mail-drafter"],
  ["drafter", "mail-drafter"],
  ["review", "mail-reviewer"],
  ["reviewer", "mail-reviewer"],
  ["guard", "mail-guard"],
  ["orchestrator", "mail-orchestrator"]
] as const satisfies ReadonlyArray<readonly [string, WorkerRole]>;

const DEFAULT_ROLE_ALIAS_MAP = new Map<string, WorkerRole>(ROLE_ALIAS_ENTRIES);

export interface MailboxRoute {
  canonicalMailboxAddress: string;
  frontAgentAddress: string;
  matchedAddress: string;
  publicAgentAddresses: string[];
  collaboratorAgentAddresses: string[];
  summonedRoles: WorkerRole[];
  internalAliasAddresses: string[];
}

export function resolveMailboxRoute(input: {
  account?: MailAccountRecord | null;
  fallbackMailboxAddress: string;
  envelope: NormalizedMailEnvelope;
}): MailboxRoute {
  const routing = parseRoutingSettings(input.account);
  const defaultMailboxAddress = firstNonEmpty(
    routing.defaultMailboxAddress,
    normalizeAddress(input.account?.emailAddress),
    normalizeAddress(input.fallbackMailboxAddress)
  );
  const { candidates, explicitCandidates } = collectRouteCandidates(input.envelope, defaultMailboxAddress);
  const publicAliases = buildPublicAliases(routing, defaultMailboxAddress);
  const publicAgentAddresses: string[] = [];
  const collaboratorAgentAddresses: string[] = [];
  const internalAliasAddresses = new Set<string>();
  const summonedRoles = new Set<WorkerRole>();

  let matchedAddress = defaultMailboxAddress;
  let canonicalMailboxAddress = defaultMailboxAddress;
  let frontAgentAddress = defaultMailboxAddress;
  let frontRouteResolved = false;

  for (const candidate of candidates) {
    const exactRole = routing.roleAliases.get(candidate);
    if (exactRole) {
      internalAliasAddresses.add(candidate);
      summonedRoles.add(exactRole);
      if (matchedAddress === defaultMailboxAddress) {
        matchedAddress = candidate;
      }
      continue;
    }

    if (publicAliases.has(candidate)) {
      addUniqueAddress(publicAgentAddresses, candidate);
      if (!frontRouteResolved) {
        matchedAddress = candidate;
        canonicalMailboxAddress = candidate;
        frontAgentAddress = candidate;
        frontRouteResolved = true;
      } else if (candidate !== canonicalMailboxAddress) {
        if (explicitCandidates.has(candidate) && candidate !== defaultMailboxAddress) {
          addUniqueAddress(collaboratorAgentAddresses, candidate);
        }
      }
      continue;
    }

    const plusRole = resolvePlusRoleAlias(candidate, publicAliases, routing.plusRoleAliases);
    if (plusRole) {
      internalAliasAddresses.add(candidate);
      summonedRoles.add(plusRole);
      if (matchedAddress === defaultMailboxAddress) {
        matchedAddress = candidate;
      }
    }
  }

  return {
    canonicalMailboxAddress,
    frontAgentAddress,
    matchedAddress,
    publicAgentAddresses,
    collaboratorAgentAddresses,
    summonedRoles: [...summonedRoles],
    internalAliasAddresses: [...internalAliasAddresses]
  };
}

export function filterInternalAliasRecipients(
  recipients: string[],
  canonicalMailboxAddress: string,
  extraInternalAliasAddresses: string[] = []
) {
  const mailboxDomain = getDomain(canonicalMailboxAddress);
  const extra = new Set(extraInternalAliasAddresses.map((value) => normalizeAddress(value)).filter(Boolean));

  return recipients.filter((recipient) => {
    const normalized = normalizeAddress(recipient);
    if (!normalized) {
      return false;
    }

    if (normalized === normalizeAddress(canonicalMailboxAddress)) {
      return false;
    }

    if (extra.has(normalized)) {
      return false;
    }

    if (!mailboxDomain || getDomain(normalized) !== mailboxDomain) {
      return true;
    }

    return !matchesDefaultRoleAlias(normalized);
  });
}

function collectRouteCandidates(envelope: NormalizedMailEnvelope, fallbackMailboxAddress: string) {
  const explicitCandidates = uniqueAddresses([
    ...envelope.envelopeRecipients,
    readAddressHeader(envelope.headers, "delivered-to"),
    readAddressHeader(envelope.headers, "x-original-to"),
    ...envelope.to.map((entry) => entry.email),
    ...envelope.cc.map((entry) => entry.email)
  ]);

  const candidates = [
    ...explicitCandidates,
    fallbackMailboxAddress
  ];

  return {
    candidates: uniqueAddresses(candidates),
    explicitCandidates: new Set(explicitCandidates)
  };
}

function buildPublicAliases(
  routing: ParsedRoutingSettings,
  defaultMailboxAddress: string
) {
  const values = [
    defaultMailboxAddress,
    ...routing.publicAliases
  ];

  return new Set(values.map((value) => normalizeAddress(value)).filter(Boolean));
}

function resolvePlusRoleAlias(
  address: string,
  publicAliases: Set<string>,
  plusRoleAliases: Map<string, WorkerRole>
) {
  const parsed = splitAddress(address);
  if (!parsed.plusTag) {
    return null;
  }

  const baseAddress = `${parsed.local}@${parsed.domain}`;
  if (!publicAliases.has(baseAddress)) {
    return null;
  }

  return plusRoleAliases.get(parsed.plusTag) ?? null;
}

function matchesDefaultRoleAlias(address: string) {
  const parsed = splitAddress(address);
  if (!parsed.domain) {
    return false;
  }

  return (
    DEFAULT_ROLE_ALIAS_MAP.has(parsed.local) ||
    (parsed.plusTag ? DEFAULT_ROLE_ALIAS_MAP.has(parsed.plusTag) : false)
  );
}

function parseRoutingSettings(account?: MailAccountRecord | null): ParsedRoutingSettings {
  const settings = (account?.settings ?? {}) as Record<string, unknown>;
  const routing =
    typeof settings.routing === "object" && settings.routing !== null
      ? (settings.routing as Record<string, unknown>)
      : {};
  const aliases =
    typeof settings.aliases === "object" && settings.aliases !== null
      ? (settings.aliases as Record<string, unknown>)
      : {};

  const defaultMailboxAddress = firstNonEmpty(
    readString(routing.canonicalAlias),
    readString(aliases.canonicalAlias)
  );
  const publicAliases = uniqueAddresses([
    ...readStringArray(routing.publicAliases),
    ...readStringArray(aliases.publicAliases),
    ...readStringArray(aliases.exactAliases)
  ]);

  const roleAliases = new Map<string, WorkerRole>();
  const plusRoleAliases = new Map<string, WorkerRole>(DEFAULT_ROLE_ALIAS_MAP);

  for (const [alias, role] of readRoleMap(routing.roleAliases)) {
    roleAliases.set(alias, role);
  }
  for (const [alias, role] of readRoleMap(aliases.roleAliases)) {
    roleAliases.set(alias, role);
  }
  for (const [tag, role] of readRoleMap(routing.plusRoleAliases, true)) {
    plusRoleAliases.set(tag, role);
  }
  for (const [tag, role] of readRoleMap(aliases.plusRoleAliases, true)) {
    plusRoleAliases.set(tag, role);
  }

  return {
    defaultMailboxAddress,
    publicAliases,
    roleAliases,
    plusRoleAliases
  };
}

function readRoleMap(
  value: unknown,
  normalizeKeyOnly = false
): Array<[string, WorkerRole]> {
  if (typeof value !== "object" || value === null) {
    return [];
  }

  const entries: Array<[string, WorkerRole]> = [];

  for (const [rawKey, rawRole] of Object.entries(value)) {
    if (typeof rawRole !== "string") {
      continue;
    }

    const role = normalizeWorkerRole(rawRole);
    if (!role) {
      continue;
    }

    const key = normalizeKeyOnly ? normalizeToken(rawKey) : normalizeAddress(rawKey);
    if (!key) {
      continue;
    }

    entries.push([key, role]);
  }

  return entries;
}

function normalizeWorkerRole(value: string): WorkerRole | null {
  const normalized = normalizeToken(value);

  for (const role of DEFAULT_ROLE_ALIAS_MAP.values()) {
    if (role === normalized) {
      return role;
    }
  }

  return DEFAULT_ROLE_ALIAS_MAP.get(normalized) ?? null;
}

function readString(value: unknown) {
  return typeof value === "string" ? normalizeAddress(value) : "";
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry) => (typeof entry === "string" ? entry : "")).map(normalizeAddress).filter(Boolean);
}

function readAddressHeader(headers: Array<{ name: string; value: string }>, name: string) {
  const header = headers.find((entry) => entry.name.toLowerCase() === name.toLowerCase())?.value;
  return extractEmailAddress(header);
}

function extractEmailAddress(value: string | undefined) {
  if (!value) {
    return "";
  }

  const match = value.match(/<([^>]+)>/);
  return normalizeAddress(match ? match[1] : value.split(/[,\s]/)[0] ?? "");
}

function splitAddress(address: string) {
  const normalized = normalizeAddress(address);
  const [localPart = "", domain = ""] = normalized.split("@");
  const [local, plusTag = ""] = localPart.split("+");

  return {
    local,
    plusTag: normalizeToken(plusTag),
    domain
  };
}

function getDomain(address: string) {
  return splitAddress(address).domain;
}

function uniqueAddresses(values: string[]) {
  const seen = new Set<string>();
  const addresses: string[] = [];

  for (const value of values) {
    const normalized = normalizeAddress(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    addresses.push(normalized);
  }

  return addresses;
}

function addUniqueAddress(target: string[], value: string) {
  const normalized = normalizeAddress(value);
  if (!normalized || target.includes(normalized)) {
    return;
  }

  target.push(normalized);
}

function normalizeAddress(value?: string) {
  return value?.trim().toLowerCase() ?? "";
}

function normalizeToken(value?: string) {
  return value?.trim().toLowerCase() ?? "";
}

function firstNonEmpty(...values: string[]) {
  return values.find((value) => value.length > 0) ?? "";
}

interface ParsedRoutingSettings {
  defaultMailboxAddress: string;
  publicAliases: string[];
  roleAliases: Map<string, WorkerRole>;
  plusRoleAliases: Map<string, WorkerRole>;
}
