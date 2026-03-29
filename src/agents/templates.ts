import type { PublicAgentInbox, SubAgentTarget, VirtualMailbox } from "../core/types.js";

export interface AgentTemplateCollaborator {
  agentId: string;
  reason: string;
}

export interface AgentTemplatePersistentAgent {
  agentId: string;
  displayName: string;
  purpose: string;
  publicMailboxId: string;
  visibilityPolicyRef?: string;
  capabilityPolicyRef?: string;
  inbox: Pick<PublicAgentInbox, "activeRoomLimit" | "ackSlaSeconds" | "burstCoalesceSeconds">;
  collaborators: AgentTemplateCollaborator[];
}

export interface AgentTemplateSummary {
  persistentAgents: number;
  burstTargets: number;
  notes: string[];
}

export interface AgentTemplate {
  templateId: string;
  displayName: string;
  summary: string;
  inspiration: string;
  persistentAgents: AgentTemplatePersistentAgent[];
  subagentTargets: Array<{
    targetId: string;
    mailboxId: string;
    openClawAgentId: string;
    resultSchema: SubAgentTarget["resultSchema"];
    sandboxMode: SubAgentTarget["sandboxMode"];
    maxActivePerRoom: number;
    maxQueuedPerInbox: number;
  }>;
  headcount: AgentTemplateSummary;
}

export interface AgentDirectoryEntry {
  agentId: string;
  displayName: string;
  purpose: string;
  publicMailboxId: string;
  virtualMailboxes: string[];
  collaboratorAgentIds: string[];
  templateId?: string;
}

export interface HeadcountRecommendation {
  templateId: string;
  displayName: string;
  summary: string;
  confidence: "starter" | "medium" | "high";
  persistentAgents: number;
  burstTargets: number;
  reasons: string[];
}

const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    templateId: "one-person-company",
    displayName: "One-Person Company",
    summary: "One front-door operator with durable specialist peers and burst workers behind the inbox.",
    inspiration: "single-operator company",
    persistentAgents: [
      {
        agentId: "assistant",
        displayName: "Founder Desk",
        purpose: "Own the front inbox, triage rooms, ACK quickly, and decide when work should split.",
        publicMailboxId: "public:assistant",
        inbox: {
          activeRoomLimit: 4,
          ackSlaSeconds: 180,
          burstCoalesceSeconds: 90
        },
        collaborators: [
          {
            agentId: "research",
            reason: "Pull evidence, attachments, and factual verification before a customer-facing final."
          },
          {
            agentId: "ops",
            reason: "Handle approvals, handoffs, and external coordination when a room turns operational."
          }
        ]
      },
      {
        agentId: "research",
        displayName: "Research Lead",
        purpose: "Turn room questions into evidence-backed claims and reusable summaries.",
        publicMailboxId: "public:research",
        inbox: {
          activeRoomLimit: 2,
          ackSlaSeconds: 600,
          burstCoalesceSeconds: 180
        },
        collaborators: [
          {
            agentId: "assistant",
            reason: "Return evidence and claim packets to the front desk instead of sending externally."
          }
        ]
      },
      {
        agentId: "ops",
        displayName: "Operations Desk",
        purpose: "Review commitments, approvals, and human handoff readiness before side effects.",
        publicMailboxId: "public:ops",
        inbox: {
          activeRoomLimit: 2,
          ackSlaSeconds: 900,
          burstCoalesceSeconds: 180
        },
        collaborators: [
          {
            agentId: "assistant",
            reason: "Gate outbound actions and long-tail customer promises."
          }
        ]
      }
    ],
    subagentTargets: [
      {
        targetId: "research-target",
        mailboxId: "subagent:research",
        openClawAgentId: "research-agent",
        resultSchema: "research",
        sandboxMode: "require",
        maxActivePerRoom: 1,
        maxQueuedPerInbox: 8
      },
      {
        targetId: "drafter-target",
        mailboxId: "subagent:drafter",
        openClawAgentId: "drafter-agent",
        resultSchema: "draft",
        sandboxMode: "require",
        maxActivePerRoom: 1,
        maxQueuedPerInbox: 8
      }
    ],
    headcount: {
      persistentAgents: 3,
      burstTargets: 2,
      notes: [
        "Start with one front desk and keep heavy lifting burst-based until workload stabilizes.",
        "Promote repeated research or operations load into durable agents only after inbox pressure is visible."
      ]
    }
  },
  {
    templateId: "three-provinces-six-departments",
    displayName: "Three Provinces, Six Departments",
    summary: "A larger operating roster for front office, review, governance, and specialist collaboration.",
    inspiration: "three provinces and six departments",
    persistentAgents: [
      {
        agentId: "zhongshu",
        displayName: "Zhongshu Draft Office",
        purpose: "Draft structured responses and keep room summaries aligned before review.",
        publicMailboxId: "public:zhongshu",
        inbox: {
          activeRoomLimit: 3,
          ackSlaSeconds: 420,
          burstCoalesceSeconds: 120
        },
        collaborators: [
          {
            agentId: "menxia",
            reason: "Send review-ready drafts upstream for policy and quality checks."
          },
          {
            agentId: "shangshu",
            reason: "Coordinate execution once the room is ready for delivery."
          }
        ]
      },
      {
        agentId: "menxia",
        displayName: "Menxia Review Office",
        purpose: "Review facts, tone, and governance before a room can progress to final.",
        publicMailboxId: "public:menxia",
        inbox: {
          activeRoomLimit: 2,
          ackSlaSeconds: 600,
          burstCoalesceSeconds: 180
        },
        collaborators: [
          {
            agentId: "zhongshu",
            reason: "Return pass, request-change, or block decisions to the drafting office."
          }
        ]
      },
      {
        agentId: "shangshu",
        displayName: "Shangshu Operations Office",
        purpose: "Own execution, approvals, handoff, and downstream operational follow-through.",
        publicMailboxId: "public:shangshu",
        inbox: {
          activeRoomLimit: 3,
          ackSlaSeconds: 420,
          burstCoalesceSeconds: 120
        },
        collaborators: [
          {
            agentId: "zhongshu",
            reason: "Receive final-ready packets after drafting and review converge."
          },
          {
            agentId: "menxia",
            reason: "Require reviewer and governance clearance before external effects."
          }
        ]
      },
      {
        agentId: "personnel",
        displayName: "Personnel Office",
        purpose: "Handle identity-sensitive escalations, role changes, and human routing.",
        publicMailboxId: "public:personnel",
        inbox: {
          activeRoomLimit: 2,
          ackSlaSeconds: 900,
          burstCoalesceSeconds: 240
        },
        collaborators: [
          {
            agentId: "shangshu",
            reason: "Support people and access workflows that need explicit handoff."
          }
        ]
      },
      {
        agentId: "revenue",
        displayName: "Revenue Office",
        purpose: "Own billing, vendor, and contract-sensitive rooms that need financial precision.",
        publicMailboxId: "public:revenue",
        inbox: {
          activeRoomLimit: 2,
          ackSlaSeconds: 900,
          burstCoalesceSeconds: 240
        },
        collaborators: [
          {
            agentId: "shangshu",
            reason: "Coordinate outbound commitments with operations before sending."
          }
        ]
      },
      {
        agentId: "works",
        displayName: "Works Office",
        purpose: "Run attachment-heavy work, implementation requests, and execution-heavy follow-up.",
        publicMailboxId: "public:works",
        inbox: {
          activeRoomLimit: 3,
          ackSlaSeconds: 900,
          burstCoalesceSeconds: 180
        },
        collaborators: [
          {
            agentId: "zhongshu",
            reason: "Feed implementation evidence back into final drafts."
          }
        ]
      }
    ],
    subagentTargets: [
      {
        targetId: "research-target",
        mailboxId: "subagent:research",
        openClawAgentId: "research-agent",
        resultSchema: "research",
        sandboxMode: "require",
        maxActivePerRoom: 2,
        maxQueuedPerInbox: 12
      },
      {
        targetId: "drafter-target",
        mailboxId: "subagent:drafter",
        openClawAgentId: "drafter-agent",
        resultSchema: "draft",
        sandboxMode: "require",
        maxActivePerRoom: 2,
        maxQueuedPerInbox: 12
      }
    ],
    headcount: {
      persistentAgents: 6,
      burstTargets: 2,
      notes: [
        "Use this when multiple room types are active at once and review or approvals regularly block the front desk.",
        "Keep burst researchers and drafters for spikes; keep durable offices for recurring governance and operations."
      ]
    }
  }
];

export function listAgentTemplates() {
  return AGENT_TEMPLATES.map((template) => ({
    templateId: template.templateId,
    displayName: template.displayName,
    summary: template.summary,
    inspiration: template.inspiration,
    persistentAgents: template.persistentAgents.map((agent) => ({
      agentId: agent.agentId,
      displayName: agent.displayName,
      purpose: agent.purpose,
      publicMailboxId: agent.publicMailboxId
    })),
    headcount: template.headcount
  }));
}

export function listAgentTemplateDefinitions() {
  return AGENT_TEMPLATES.map((template) => ({
    ...template,
    persistentAgents: template.persistentAgents.map((agent) => ({
      ...agent,
      collaborators: agent.collaborators.map((collaborator) => ({ ...collaborator }))
    })),
    subagentTargets: template.subagentTargets.map((target) => ({ ...target })),
    headcount: {
      ...template.headcount,
      notes: [...template.headcount.notes]
    }
  }));
}

export function getAgentTemplate(templateId: string) {
  return AGENT_TEMPLATES.find((template) => template.templateId === templateId) ?? null;
}

export function buildAgentDirectoryEntry(input: {
  templateId?: string;
  agent: AgentTemplatePersistentAgent;
}): AgentDirectoryEntry {
  return {
    agentId: input.agent.agentId,
    displayName: input.agent.displayName,
    purpose: input.agent.purpose,
    publicMailboxId: input.agent.publicMailboxId,
    virtualMailboxes: buildAgentVirtualMailboxIds(input.agent.agentId, input.agent.publicMailboxId),
    collaboratorAgentIds: input.agent.collaborators.map((entry) => entry.agentId),
    templateId: input.templateId
  };
}

export function buildAgentVirtualMailboxIds(agentId: string, publicMailboxId?: string) {
  return [
    publicMailboxId ?? `public:${agentId}`,
    `internal:${agentId}:orchestrator`,
    `internal:${agentId}:reviewer`,
    `internal:${agentId}:guard`
  ];
}

export function buildAgentVirtualMailboxes(input: {
  accountId: string;
  agentId: string;
  publicMailboxId?: string;
  now: string;
  visibilityPolicyRef?: string;
  capabilityPolicyRef?: string;
}) {
  const principalId = `principal:${input.agentId}`;
  const shared = {
    accountId: input.accountId,
    principalId,
    active: true,
    createdAt: input.now,
    updatedAt: input.now,
    visibilityPolicyRef: input.visibilityPolicyRef,
    capabilityPolicyRef: input.capabilityPolicyRef
  } satisfies Pick<
    VirtualMailbox,
    "accountId" | "principalId" | "active" | "createdAt" | "updatedAt" | "visibilityPolicyRef" | "capabilityPolicyRef"
  >;

  return [
    {
      ...shared,
      mailboxId: input.publicMailboxId ?? `public:${input.agentId}`,
      kind: "public"
    },
    {
      ...shared,
      mailboxId: `internal:${input.agentId}:orchestrator`,
      kind: "internal_role",
      role: "orchestrator"
    },
    {
      ...shared,
      mailboxId: `internal:${input.agentId}:reviewer`,
      kind: "governance",
      role: "reviewer"
    },
    {
      ...shared,
      mailboxId: `internal:${input.agentId}:guard`,
      kind: "governance",
      role: "guard"
    }
  ] satisfies VirtualMailbox[];
}

export function recommendAgentHeadcount(input: {
  activeRoomCount: number;
  subagentRunCounts: Record<string, number>;
}) {
  const researchLoad = input.subagentRunCounts["subagent:research"] ?? 0;
  const draftLoad = input.subagentRunCounts["subagent:drafter"] ?? 0;
  const hasSustainedSpecialistLoad = researchLoad + draftLoad >= 4 || input.activeRoomCount >= 6;

  return AGENT_TEMPLATES.map<HeadcountRecommendation>((template) => ({
    templateId: template.templateId,
    displayName: template.displayName,
    summary:
      template.templateId === "three-provinces-six-departments" && hasSustainedSpecialistLoad
        ? "Backlog suggests a larger durable roster with dedicated review and operations desks."
        : template.templateId === "one-person-company"
          ? "Best default when one public operator should stay responsive and let burst workers absorb spikes."
          : template.summary,
    confidence:
      template.templateId === "three-provinces-six-departments"
        ? hasSustainedSpecialistLoad
          ? "high"
          : "medium"
        : hasSustainedSpecialistLoad
          ? "medium"
          : "starter",
    persistentAgents: template.headcount.persistentAgents,
    burstTargets: template.headcount.burstTargets,
    reasons:
      template.templateId === "three-provinces-six-departments"
        ? [
            `active rooms: ${input.activeRoomCount}`,
            `research bursts: ${researchLoad}`,
            `draft bursts: ${draftLoad}`
          ]
        : [
            "start with one front inbox and let specialists stay behind internal mail",
            `active rooms: ${input.activeRoomCount}`
          ]
  }));
}
