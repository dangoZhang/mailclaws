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
  sourceAlignment?: string;
  sourceRefs?: string[];
  roleContract?: string[];
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
  sourceRefs?: string[];
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
    sourceRefs: ["https://github.com/cyfyifanchen/one-person-company"],
    persistentAgents: [
      {
        agentId: "assistant",
        displayName: "Founder Desk",
        purpose: "Own the front inbox, triage rooms, ACK quickly, and decide when work should split.",
        publicMailboxId: "public:assistant",
        sourceAlignment:
          "Adapted from the one-person-company operating model. The upstream project is a solo-operator playbook, not a ready-made soul roster, so MailClaws maps it into durable inbox roles.",
        sourceRefs: ["https://github.com/cyfyifanchen/one-person-company"],
        roleContract: [
          "Stay on the public inbox and keep the room moving with ACK, progress, and clear delegation.",
          "Escalate evidence gathering and execution follow-through by internal mail instead of carrying every detail in one prompt.",
          "Never bypass outbox governance for real external send."
        ],
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
        sourceAlignment:
          "A MailClaws durable peer added on top of the solo-operator model so one person can stay responsive while deep evidence work runs behind internal mail.",
        sourceRefs: ["https://github.com/cyfyifanchen/one-person-company"],
        roleContract: [
          "Read the task mail, room Pre, and referenced evidence before doing any new retrieval.",
          "Return claims, evidence, and reusable summaries to the front desk.",
          "Do not send externally."
        ],
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
        sourceAlignment:
          "A MailClaws durable peer added to make the solo-operator pattern safe for governed send, approvals, and handoff.",
        sourceRefs: ["https://github.com/cyfyifanchen/one-person-company"],
        roleContract: [
          "Review commitments before they become outbound promises.",
          "Own approvals, handoff readiness, and operator-visible follow-through.",
          "Block external side effects that skip governance."
        ],
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
    summary: "An Edict-aligned operating roster with Taizi, the three provinces, and six departments mapped into durable inbox roles.",
    inspiration: "three provinces and six departments",
    sourceRefs: ["https://github.com/cft0808/edict"],
    persistentAgents: [
      {
        agentId: "taizi",
        displayName: "Taizi Coordination Office",
        purpose: "Own the public front door, receive new rooms, coordinate the three provinces, and decide when to fan out work.",
        publicMailboxId: "public:taizi",
        sourceAlignment:
          "Directly aligned to Edict's Taizi role: receive requests, coordinate the roster, and keep work flowing across offices.",
        sourceRefs: [
          "https://github.com/cft0808/edict",
          "https://github.com/cft0808/edict/tree/main/agents/taizi"
        ],
        roleContract: [
          "Receive inbound rooms and decide whether to ACK, delegate, review, approve, or hand off.",
          "Keep a single active orchestrator per room and supersede stale work on new replies.",
          "Do not send externally until review and governance have cleared the room."
        ],
        inbox: {
          activeRoomLimit: 4,
          ackSlaSeconds: 180,
          burstCoalesceSeconds: 90
        },
        collaborators: [
          {
            agentId: "zhongshu",
            reason: "Ask for structured draft direction and synthesis before a room moves toward final."
          },
          {
            agentId: "shangshu",
            reason: "Dispatch operational execution once drafting and review have converged."
          }
        ]
      },
      {
        agentId: "zhongshu",
        displayName: "Zhongshu Draft Office",
        purpose: "Draft structured responses and keep room summaries aligned before review.",
        publicMailboxId: "public:zhongshu",
        sourceAlignment:
          "Aligned to Edict's Zhongshu role: draft direction, structure plans, and turn goals into coherent response packets.",
        sourceRefs: [
          "https://github.com/cft0808/edict",
          "https://github.com/cft0808/edict/tree/main/agents/zhongshu"
        ],
        roleContract: [
          "Turn room questions and evidence into structured draft packets.",
          "Keep summaries aligned with the room's latest Pre before review.",
          "Hand every draft to Menxia or Taizi rather than sending directly."
        ],
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
        sourceAlignment:
          "Aligned to Edict's Menxia role: challenge drafts, perform policy and quality review, and return pass or veto decisions.",
        sourceRefs: [
          "https://github.com/cft0808/edict",
          "https://github.com/cft0808/edict/tree/main/agents/menxia"
        ],
        roleContract: [
          "Review claims, tone, and policy fit before a room becomes final-ready.",
          "Return pass, request-change, or block decisions with explicit reasons.",
          "Do not create external sends."
        ],
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
        sourceAlignment:
          "Aligned to Edict's Shangshu role: coordinate execution and route work into the right specialist office after drafting and review.",
        sourceRefs: [
          "https://github.com/cft0808/edict",
          "https://github.com/cft0808/edict/tree/main/agents/shangshu"
        ],
        roleContract: [
          "Route execution into the right specialist office once a room is ready.",
          "Own approval, handoff, and downstream follow-through.",
          "Require reviewer or guard clearance before side effects."
        ],
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
        agentId: "libu-personnel",
        displayName: "Libu Personnel Office",
        purpose: "Handle people, role, identity, and routing changes that touch durable ownership or access boundaries.",
        publicMailboxId: "public:libu-personnel",
        sourceAlignment:
          "Aligned to the personnel ministry in Edict's six-department roster.",
        sourceRefs: ["https://github.com/cft0808/edict"],
        roleContract: [
          "Handle identity-sensitive escalation and human routing.",
          "Review ownership or access changes before they become durable facts."
        ],
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
        agentId: "hubu",
        displayName: "Hubu Finance Office",
        purpose: "Own billing, vendor, revenue, and resource-allocation rooms that need financial precision.",
        publicMailboxId: "public:hubu",
        sourceAlignment:
          "Directly aligned to Edict's Hubu role for finance, resource allocation, and operational support.",
        sourceRefs: [
          "https://github.com/cft0808/edict",
          "https://github.com/cft0808/edict/tree/main/agents/hubu"
        ],
        roleContract: [
          "Own finance-sensitive rooms and validate monetary commitments before send.",
          "Coordinate with Shangshu before outbound commitments are made."
        ],
        inbox: {
          activeRoomLimit: 2,
          ackSlaSeconds: 900,
          burstCoalesceSeconds: 240
        },
        collaborators: [
          {
            agentId: "shangshu",
            reason: "Coordinate outbound commitments and resource changes with operations before sending."
          }
        ]
      },
      {
        agentId: "libu-rites",
        displayName: "Libu Rites Office",
        purpose: "Own protocol, ceremony, stakeholder-facing tone, and relationship-sensitive presentation work.",
        publicMailboxId: "public:libu-rites",
        sourceAlignment:
          "Aligned to the rites ministry in Edict's six-department roster, adapted for email tone, protocol, and stakeholder presentation.",
        sourceRefs: ["https://github.com/cft0808/edict"],
        roleContract: [
          "Review protocol-sensitive or high-ceremony communication before final send.",
          "Return tone and presentation guidance to Zhongshu or Taizi."
        ],
        inbox: {
          activeRoomLimit: 2,
          ackSlaSeconds: 900,
          burstCoalesceSeconds: 240
        },
        collaborators: [
          {
            agentId: "zhongshu",
            reason: "Refine tone and protocol before final drafts leave the drafting office."
          }
        ]
      },
      {
        agentId: "bingbu",
        displayName: "Bingbu Response Office",
        purpose: "Own incident, escalation, and rapid-response rooms that require coordinated action under pressure.",
        publicMailboxId: "public:bingbu",
        sourceAlignment:
          "Aligned to the Bingbu role in Edict's six-department roster, adapted for response coordination and escalation handling.",
        sourceRefs: ["https://github.com/cft0808/edict"],
        roleContract: [
          "Handle urgent or incident-like rooms with fast coordination and clear status reporting.",
          "Route action status back through Shangshu and Taizi rather than bypassing governance."
        ],
        inbox: {
          activeRoomLimit: 2,
          ackSlaSeconds: 300,
          burstCoalesceSeconds: 60
        },
        collaborators: [
          {
            agentId: "shangshu",
            reason: "Coordinate time-sensitive execution and escalation response."
          }
        ]
      },
      {
        agentId: "xingbu",
        displayName: "Xingbu Compliance Office",
        purpose: "Own policy, compliance, dispute, and risk-heavy rooms that need hard governance review.",
        publicMailboxId: "public:xingbu",
        sourceAlignment:
          "Aligned to the Xingbu role in Edict's six-department roster, adapted for policy and compliance enforcement.",
        sourceRefs: ["https://github.com/cft0808/edict"],
        roleContract: [
          "Review policy-sensitive rooms and return governance decisions with reasons.",
          "Escalate to approval or veto when the room crosses policy boundaries."
        ],
        inbox: {
          activeRoomLimit: 2,
          ackSlaSeconds: 600,
          burstCoalesceSeconds: 180
        },
        collaborators: [
          {
            agentId: "menxia",
            reason: "Support hard governance review with explicit policy or risk findings."
          }
        ]
      },
      {
        agentId: "gongbu",
        displayName: "Gongbu Works Office",
        purpose: "Run attachment-heavy work, implementation requests, and execution-heavy follow-up.",
        publicMailboxId: "public:gongbu",
        sourceAlignment:
          "Aligned to the Gongbu role in Edict's six-department roster, adapted for implementation and artifact-heavy execution work.",
        sourceRefs: ["https://github.com/cft0808/edict"],
        roleContract: [
          "Handle implementation-heavy or artifact-heavy rooms.",
          "Feed implementation evidence and delivery status back into Zhongshu and Shangshu."
        ],
        inbox: {
          activeRoomLimit: 3,
          ackSlaSeconds: 900,
          burstCoalesceSeconds: 180
        },
        collaborators: [
          {
            agentId: "zhongshu",
            reason: "Feed implementation evidence back into final drafts."
          },
          {
            agentId: "shangshu",
            reason: "Keep execution status aligned with operational follow-through."
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
      persistentAgents: 10,
      burstTargets: 2,
      notes: [
        "Use this when the inbox has sustained load across multiple room types and governance or execution keeps blocking the front desk.",
        "This template is intentionally closer to Edict's full roster: Taizi + three provinces + six departments.",
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
