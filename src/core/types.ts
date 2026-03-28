export const threadRoomStates = [
  "idle",
  "queued",
  "running",
  "waiting_workers",
  "replying",
  "handoff",
  "done",
  "failed"
] as const;

export const workerRoles = [
  "mail-orchestrator",
  "mail-attachment-reader",
  "mail-researcher",
  "mail-drafter",
  "mail-reviewer",
  "mail-guard"
] as const;

export const taskStatuses = [
  "queued",
  "running",
  "done",
  "failed",
  "cancelled"
] as const;

export const taskNodeClasses = ["worker_execution", "mail_protocol"] as const;

export const prePacketKinds = [
  "ack",
  "progress",
  "question",
  "claim",
  "evidence",
  "draft",
  "review",
  "approval",
  "final",
  "handoff",
  "system_notice"
] as const;

export const prePacketAudiences = ["external", "internal", "governance"] as const;

export const mailTaskKinds = [
  "reply_now",
  "long_running",
  "share_forward",
  "project_work",
  "scheduled_mail"
] as const;

export const mailTaskStages = [
  "triaged",
  "in_progress",
  "ack",
  "progress",
  "final",
  "follow_up",
  "waiting_approval",
  "waiting_external",
  "handoff",
  "failed",
  "stale"
] as const;

export const threadLedgerEventTypes = [
  "room.created",
  "room.continued",
  "room.revision.bumped",
  "message.bound_to_room",
  "mail.inbound_received",
  "mail.inbound_normalized",
  "room.planned",
  "task.mail_classified",
  "task.mail_stage_changed",
  "room.memory_snapshotted",
  "room.pre_snapshot.created",
  "worker.task_assigned",
  "worker.progress",
  "worker.result",
  "room.shared_facts_updated",
  "approval.requested",
  "approval.approved",
  "approval.rejected",
  "handoff.requested",
  "handoff.completed",
  "memory.promotion.requested",
  "memory.promotion.reviewed",
  "memory.promotion.approved",
  "memory.promotion.rejected",
  "virtual_mail.thread_created",
  "virtual_mail.message_submitted",
  "virtual_mail.message_delivered",
  "virtual_mail.delivery_leased",
  "virtual_mail.delivery_consumed",
  "virtual_mail.message_replied",
  "virtual_mail.thread_superseded",
  "virtual_mail.message_stale",
  "virtual_mail.message_vetoed",
  "virtual_mail.reducer_started",
  "virtual_mail.reducer_completed",
  "virtual_mail.mailbox_rebuilt",
  "gateway.session.bound",
  "gateway.turn.projected",
  "gateway.outcome.projected",
  "gateway.outcome.dispatch_succeeded",
  "gateway.outcome.dispatch_failed",
  "subagent.run.accepted",
  "subagent.run.completed",
  "subagent.run.failed",
  "subagent.run.stale",
  "mail.ack_sent",
  "mail.progress_sent",
  "mail.final_sent",
  "project.linked",
  "project.updated",
  "project.closed",
  "scheduled_mail.created",
  "scheduled_mail.paused",
  "scheduled_mail.resumed",
  "scheduled_mail.cancelled",
  "scheduled_mail.triggered",
  "room.closed",
  "room.failed"
] as const;

export const virtualMailboxKinds = [
  "public",
  "internal_role",
  "governance",
  "human",
  "system"
] as const;

export const virtualThreadKinds = ["room", "work"] as const;

export const virtualThreadStatuses = [
  "open",
  "blocked",
  "waiting_review",
  "waiting_approval",
  "closed",
  "superseded"
] as const;

export const virtualMessageKinds = [
  "task",
  "question",
  "claim",
  "evidence",
  "draft",
  "review",
  "approval",
  "progress",
  "final_ready",
  "handoff",
  "system_notice"
] as const;

export const virtualMessageVisibilities = [
  "room",
  "internal",
  "private",
  "governance"
] as const;
export const virtualMessageOriginKinds = ["provider_mail", "gateway_chat", "virtual_internal"] as const;
export const gatewayOutcomeProjectionModes = [
  "session_reply",
  "workbench_notice",
  "no_external_projection"
] as const;
export const gatewayOutcomeDispatchStatuses = ["pending", "dispatched", "failed"] as const;

export const mailboxDeliveryStatuses = [
  "queued",
  "leased",
  "delivered",
  "consumed",
  "blocked",
  "stale",
  "vetoed",
  "superseded"
] as const;

export const inboxItemStates = [
  "new",
  "triaged",
  "active",
  "delegated",
  "waiting_review",
  "waiting_approval",
  "waiting_external",
  "handoff",
  "done",
  "snoozed"
] as const;

export const projectAggregateStatuses = ["open", "done", "blocked", "archived"] as const;
export const scheduledMailJobKinds = ["run_at", "cron_like"] as const;
export const scheduledMailJobStatuses = ["active", "paused", "cancelled", "completed"] as const;

export type ThreadRoomState = (typeof threadRoomStates)[number];
export type WorkerRole = (typeof workerRoles)[number];
export type TaskStatus = (typeof taskStatuses)[number];
export type TaskNodeClass = (typeof taskNodeClasses)[number];
export type PrePacketKind = (typeof prePacketKinds)[number];
export type PrePacketAudience = (typeof prePacketAudiences)[number];
export type MailTaskKind = (typeof mailTaskKinds)[number];
export type MailTaskStage = (typeof mailTaskStages)[number];
export type ThreadLedgerEventType = (typeof threadLedgerEventTypes)[number];
export type VirtualMailboxKind = (typeof virtualMailboxKinds)[number];
export type VirtualThreadKind = (typeof virtualThreadKinds)[number];
export type VirtualThreadStatus = (typeof virtualThreadStatuses)[number];
export type VirtualMessageKind = (typeof virtualMessageKinds)[number];
export type VirtualMessageVisibility = (typeof virtualMessageVisibilities)[number];
export type VirtualMessageOriginKind = (typeof virtualMessageOriginKinds)[number];
export type GatewayOutcomeProjectionMode = (typeof gatewayOutcomeProjectionModes)[number];
export type GatewayOutcomeDispatchStatus = (typeof gatewayOutcomeDispatchStatuses)[number];
export type MailboxDeliveryStatus = (typeof mailboxDeliveryStatuses)[number];
export type InboxItemState = (typeof inboxItemStates)[number];
export type ProjectAggregateStatus = (typeof projectAggregateStatuses)[number];
export type ScheduledMailJobKind = (typeof scheduledMailJobKinds)[number];
export type ScheduledMailJobStatus = (typeof scheduledMailJobStatuses)[number];
export type InboxParticipantRole = "front" | "collaborator";

export type SubAgentTargetMode = "burst" | "bound";
export type SubAgentTargetSandboxMode = "require" | "inherit";
export type SubAgentTargetResultSchema = "research" | "reader" | "draft" | "review";
export type SubAgentRunStatus =
  | "accepted"
  | "running"
  | "completed"
  | "failed"
  | "timeout"
  | "canceled"
  | "stale";

export interface MailTurnMemoryNamespaceCapabilities {
  storesMetadata: boolean;
  isEphemeral: boolean;
  canSourcePromotionDrafts: boolean;
  canReceiveApprovedPromotions: boolean;
  supportsSnapshotPaths: boolean;
}

export interface MailTurnMemoryNamespaceDescriptor {
  scope: "agent" | "room" | "user" | "scratch";
  tenantId: string;
  namespaceKey: string;
  agentId?: string;
  roomKey?: string;
  userId?: string;
  rootDir: string;
  primaryPath: string;
  metadataPath?: string;
  capabilities: MailTurnMemoryNamespaceCapabilities;
}

export interface MailTurnMemoryNamespaces {
  room: MailTurnMemoryNamespaceDescriptor;
  agent: MailTurnMemoryNamespaceDescriptor;
  user?: MailTurnMemoryNamespaceDescriptor;
  scratch?: MailTurnMemoryNamespaceDescriptor;
}

export interface MailTurnAttachmentChunkDescriptor {
  chunkId: string;
  chunkPath: string;
  summaryPath?: string;
  sourcePath?: string;
  tokenEstimate: number;
  sha256: string;
}

export type MailTurnAttachmentInputKind = "raw" | "extracted" | "summary";

export interface MailTurnAttachmentDescriptor {
  attachmentId: string;
  filename: string;
  mimeType: string;
  sizeBytes?: number;
  contentSha256?: string;
  summaryText?: string;
  artifactPath?: string;
  rawDataPath?: string;
  extractedTextPath?: string;
  summaryPath?: string;
  summaryShortPath?: string;
  summaryLongPath?: string;
  preferredInputPath?: string;
  preferredInputFilename?: string;
  preferredInputMimeType?: string;
  preferredInputKind?: MailTurnAttachmentInputKind;
  chunks: MailTurnAttachmentChunkDescriptor[];
}

export type MailTurnNetworkAccess = "none" | "allowlisted";
export type MailTurnFilesystemAccess = "none" | "workspace-read";
export type MailTurnOutboundMode = "blocked" | "approval_required";

export interface MailRuntimePolicyManifest {
  toolPolicies: string[];
  sandboxPolicies: string[];
  networkAccess: MailTurnNetworkAccess;
  filesystemAccess: MailTurnFilesystemAccess;
  outboundMode: MailTurnOutboundMode;
}

export interface MailRuntimeExecutionBoundary {
  runtimeKind: "bridge" | "command" | "embedded" | "custom";
  runtimeLabel: string;
  policyManifest: MailRuntimePolicyManifest | null;
  manifestSource: "config" | "executor" | "none";
  namespaceValidation: boolean;
  canonicalWorkspaceBinding: boolean;
  policyAdmissionRequired: boolean;
  backendEnforcement: "external_runtime" | "local_command" | "process_adapter" | "custom";
}

export interface MailIoBoundarySummary {
  mode: "local" | "command" | "custom";
  label: string;
  protocol:
    | {
        name: string;
        version: number;
      }
    | null;
  handshakeStatus: "not_applicable" | "ready" | "failed";
  capabilities: string[];
  checkedAt: string | null;
  error: string | null;
}

export interface EmbeddedRuntimeSessionSummary {
  sessionId: string;
  sessionKey: string;
  createdAt: string;
  updatedAt: string;
  turnCount: number;
  transcriptEntryCount: number;
  statePath: string;
  transcriptPath: string;
  lastEntryRole: "user" | "assistant" | null;
  lastEntryPreview: string | null;
}

export interface BridgeRuntimeSessionSummary {
  sessionId: string;
  sessionKey: string;
  agentId: string | null;
  createdAt: string;
  updatedAt: string;
  turnCount: number;
  transcriptEntryCount: number;
  statePath: string;
  transcriptPath: string;
  lastEntryRole: "user" | "assistant" | null;
  lastEntryPreview: string | null;
}

export interface MailTurnExecutionPolicy {
  role: WorkerRole;
  tenantId: string;
  roomKey: string;
  runtimeAgentId: string;
  scratchAgentId?: string;
  userId?: string;
  toolPolicy: string;
  sandboxPolicy: string;
  networkAccess: MailTurnNetworkAccess;
  filesystemAccess: MailTurnFilesystemAccess;
  outboundMode: MailTurnOutboundMode;
  allowedMemoryScopes: ReadonlyArray<"agent" | "room" | "user" | "scratch">;
  trustLevel?: string;
  source: "default" | "config";
}

export interface VirtualMailbox {
  mailboxId: string;
  accountId: string;
  kind: VirtualMailboxKind;
  principalId?: string;
  role?: string;
  visibilityPolicyRef?: string;
  capabilityPolicyRef?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PrePacketFact {
  claim: string;
  evidenceRef?: string;
  confidence?: "low" | "medium" | "high";
}

export interface PrePacketCommitment {
  owner: string;
  action: string;
  dueAt?: string;
}

export interface PrePacketCreatedBy {
  mailboxId: string;
  agentId?: string;
  subagentTargetId?: string;
}

export interface PrePacket {
  kind: PrePacketKind;
  audience: PrePacketAudience;
  summary: string;
  facts: PrePacketFact[];
  openQuestions: string[];
  decisions: string[];
  commitments: PrePacketCommitment[];
  requestedActions: string[];
  draftBody?: string;
  roomRevision: number;
  inputsHash: string;
  createdBy: PrePacketCreatedBy;
}

export interface RoomPreSnapshot extends PrePacket {
  snapshotId: string;
  roomKey: string;
  createdAt: string;
}

export interface VirtualThread {
  threadId: string;
  roomKey: string;
  kind: VirtualThreadKind;
  topic: string;
  parentWorkThreadId?: string;
  createdByMessageId: string;
  status: VirtualThreadStatus;
  createdAt: string;
}

export interface ProjectionMetadata {
  origin: {
    kind: VirtualMessageOriginKind;
    controlPlane?: string;
    sessionKey?: string;
    runId?: string;
    frontAgentId?: string;
    sourceMessageId?: string;
  };
}

export interface VirtualMessage {
  messageId: string;
  roomKey: string;
  threadId: string;
  parentMessageId?: string;
  messageIdHeader: string;
  inReplyTo: string[];
  references: string[];
  fromPrincipalId: string;
  fromMailboxId: string;
  toMailboxIds: string[];
  ccMailboxIds: string[];
  kind: VirtualMessageKind;
  visibility: VirtualMessageVisibility;
  originKind: VirtualMessageOriginKind;
  projectionMetadata: ProjectionMetadata;
  subject: string;
  bodyRef: string;
  artifactRefs: string[];
  memoryRefs: string[];
  roomRevision: number;
  inputsHash: string;
  createdAt: string;
}

export interface MailboxDelivery {
  deliveryId: string;
  roomKey: string;
  messageId: string;
  mailboxId: string;
  status: MailboxDeliveryStatus;
  leaseOwner?: string;
  leaseUntil?: string;
  consumedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VirtualMailboxViewEntry {
  delivery: MailboxDelivery;
  message: VirtualMessage;
  thread: VirtualThread;
}

export interface GatewaySessionBinding {
  sessionKey: string;
  roomKey: string;
  bindingKind: "room" | "work_thread" | "subagent";
  workThreadId?: string;
  parentMessageId?: string;
  sourceControlPlane: string;
  frontAgentId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SubAgentTarget {
  targetId: string;
  accountId: string;
  mailboxId: string;
  openClawAgentId: string;
  mode: SubAgentTargetMode;
  model?: string;
  thinking?: string;
  runTimeoutSeconds?: number;
  boundSessionTtlSeconds?: number;
  sandboxMode: SubAgentTargetSandboxMode;
  maxActivePerRoom: number;
  maxQueuedPerInbox: number;
  allowExternalSend: boolean;
  resultSchema: SubAgentTargetResultSchema;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SubAgentRun {
  runId: string;
  roomKey: string;
  workThreadId: string;
  parentMessageId: string;
  targetId: string;
  childSessionKey: string;
  childSessionId?: string;
  roomRevision: number;
  inputsHash: string;
  status: SubAgentRunStatus;
  resultMessageId?: string;
  errorText?: string;
  request?: Record<string, unknown>;
  announceSummary?: string;
  startedAt: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublicAgentInbox {
  inboxId: string;
  accountId: string;
  agentId: string;
  activeRoomLimit: number;
  ackSlaSeconds: number;
  burstCoalesceSeconds: number;
  createdAt: string;
  updatedAt: string;
}

export interface InboxItem {
  inboxItemId: string;
  inboxId: string;
  accountId: string;
  agentId: string;
  participantRole: InboxParticipantRole;
  roomKey: string;
  latestRevision: number;
  unreadCount: number;
  newestMessageAt: string;
  state: InboxItemState;
  priority: number;
  urgency: "low" | "normal" | "high" | "critical";
  estimatedEffort: "quick" | "medium" | "heavy";
  blockedReason?: string;
  activeWorkerCount: number;
  latestSummaryRef?: string;
  needsAckBy?: string;
  lastTriagedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TriageResult {
  priority: number;
  urgency: InboxItem["urgency"];
  estimatedEffort: InboxItem["estimatedEffort"];
  needsAckNow: boolean;
  shouldDelegate: boolean;
  preferredTargets: string[];
  blockingReason?: string;
}

export interface ThreadRoom {
  roomKey: string;
  accountId: string;
  stableThreadId: string;
  parentSessionKey: string;
  frontAgentAddress?: string;
  publicAgentAddresses?: string[];
  collaboratorAgentAddresses?: string[];
  summonedRoles?: WorkerRole[];
  state: ThreadRoomState;
  revision: number;
  lastInboundSeq: number;
  lastOutboundSeq: number;
  summaryRef?: string;
  sharedFactsRef?: string;
}

export interface ProjectAggregate {
  projectId: string;
  accountId: string;
  projectKey: string;
  title: string;
  status: ProjectAggregateStatus;
  roomCount: number;
  activeRoomCount: number;
  latestSummary?: string;
  riskSummary?: string;
  nextAction?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RoomProjectLink {
  projectId: string;
  roomKey: string;
  latestRevision: number;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduledMailJob {
  jobId: string;
  roomKey: string;
  accountId: string;
  sourceMessageDedupeKey: string;
  kind: ScheduledMailJobKind;
  status: ScheduledMailJobStatus;
  scheduleRef: string;
  cronLike?: string;
  nextRunAt?: string;
  lastRunAt?: string;
  followUpSubject: string;
  followUpBody: string;
  lastOutboxId?: string;
  cancellationReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkerSession {
  sessionKey: string;
  roomKey: string;
  role: WorkerRole;
  revision: number;
  state: "idle" | "running" | "stale";
}

export interface TaskNode {
  nodeId: string;
  roomKey: string;
  revision: number;
  role: WorkerRole;
  dependsOn: string[];
  inputRefs: string[];
  deadlineMs?: number;
  priority: number;
  status: TaskStatus;
  taskClass: TaskNodeClass;
  mailTaskKind?: MailTaskKind;
  mailTaskStage?: MailTaskStage;
  title?: string;
  summary?: string;
  nextAction?: string;
}

export interface ThreadLedgerEvent<TPayload = Record<string, unknown>> {
  seq: number;
  roomKey: string;
  revision: number;
  type: ThreadLedgerEventType;
  payload: TPayload;
  createdAt: string;
}

export interface RoomSharedFactRecord {
  key: string;
  claim: string;
  evidenceRefs: string[];
  roles: string[];
}

export interface RoomSharedFactConflictClaim {
  claim: string;
  evidenceRef?: string;
  role: string;
}

export interface SharedFactConflictAcknowledgement {
  roomKey: string;
  conflictKey: string;
  status: "acknowledged";
  note: string;
  sharedFactsRef: string;
  acknowledgedAt: string;
  resolutionPath?: string;
}

export interface RoomSharedFactConflict {
  key: string;
  claims: RoomSharedFactConflictClaim[];
  status?: "open" | "acknowledged";
  acknowledgements?: SharedFactConflictAcknowledgement[];
}

export interface RoomSharedFactsArtifact {
  schemaVersion: number;
  roomKey: string;
  latestInbound: {
    dedupeKey: string;
    subject: string;
    from: string;
    receivedAt: string;
  };
  latestResponse: {
    text: string;
  } | null;
  workerSummaries: Array<{
    role: string;
    status: string;
    summary: string;
  }>;
  attachments: Array<{
    attachmentId: string;
    filename: string;
    mimeType: string;
    summaryText?: string;
    artifactPath?: string;
  }>;
  facts: RoomSharedFactRecord[];
  conflicts: RoomSharedFactConflict[];
  openQuestions: string[];
  recommendedActions: Array<{
    role: string;
    action: string;
  }>;
}

export interface RoomReplay {
  room: ThreadRoom | null;
  project: ProjectAggregate | null;
  roomProjectLinks: RoomProjectLink[];
  scheduledMailJobs: ScheduledMailJob[];
  sharedFacts: RoomSharedFactsArtifact | null;
  roomNotes: unknown;
  preSnapshots: RoomPreSnapshot[];
  ledger: ThreadLedgerEvent[];
  providerEvents: unknown[];
  runs: unknown[];
  outbox: unknown[];
  outboxAttempts: unknown[];
  attachments: unknown[];
  participants: unknown[];
  workerSessions: unknown[];
  taskNodes: TaskNode[];
  virtualMailboxes: VirtualMailbox[];
  virtualThreads: VirtualThread[];
  virtualMessages: VirtualMessage[];
  mailboxDeliveries: MailboxDelivery[];
  gatewaySessionBindings: GatewaySessionBinding[];
  subagentTargets: SubAgentTarget[];
  subagentRuns: SubAgentRun[];
  gatewayProjectionTrace: GatewayProjectionTrace;
}

export interface GatewayProjectionTrace {
  roomKey: string;
  messageIds: string[];
  messages: VirtualMessage[];
  deliveries: MailboxDelivery[];
  deliveryEntries: Array<{
    message: VirtualMessage;
    deliveries: MailboxDelivery[];
  }>;
  outcomeProjections: Array<{
    messageId: string;
    sessionKey: string;
    mode: GatewayOutcomeProjectionMode;
    projectedAt: string;
    dispatchStatus: GatewayOutcomeDispatchStatus;
    dispatchTarget?: string;
    dispatchError?: string;
    dispatchAttemptedAt?: string;
  }>;
  outcomeMessageIds: string[];
  outcomeMessages: VirtualMessage[];
  outcomeModes: GatewayOutcomeProjectionMode[];
  ledger: ThreadLedgerEvent[];
  controlPlanes: string[];
  sessionKeys: string[];
  runIds: string[];
}
