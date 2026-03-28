export function buildRoomSessionKey(
  accountId: string,
  stableThreadId: string,
  prefix = "hook:mail",
  frontAgentAddress?: string
) {
  const frontAgentSegment = buildFrontAgentScopeSegment(frontAgentAddress);
  return `${prefix}:${accountId}${frontAgentSegment}:thread:${stableThreadId}`;
}

export function buildWorkerSessionKey(
  accountId: string,
  stableThreadId: string,
  role: string,
  prefix = "hook:mail",
  frontAgentAddress?: string
) {
  return `${buildRoomSessionKey(accountId, stableThreadId, prefix, frontAgentAddress)}:agent:${role}`;
}

export function buildSubAgentSessionKey(
  accountId: string,
  stableThreadId: string,
  workThreadId: string,
  targetId: string,
  prefix = "hook:mail",
  frontAgentAddress?: string
) {
  return `${buildRoomSessionKey(accountId, stableThreadId, prefix, frontAgentAddress)}:subagent:${encodeURIComponent(targetId)}:work:${encodeURIComponent(workThreadId)}`;
}

function buildFrontAgentScopeSegment(frontAgentAddress?: string) {
  const normalized = frontAgentAddress?.trim().toLowerCase();
  if (!normalized) {
    return "";
  }

  return `:front:${encodeURIComponent(normalized)}`;
}
