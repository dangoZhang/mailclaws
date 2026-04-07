import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { loadConfig } from "../config.js";
import { replayRoom } from "../core/replay.js";
import { ingestIncomingMail, processNextRoomJob } from "../orchestration/service.js";
import type { ProviderMailEnvelope } from "../providers/types.js";
import type { ExecuteMailTurnInput, MailAgentExecutor } from "../runtime/agent-executor.js";
import { initializeDatabase } from "../storage/db.js";
import { upsertMailAccount } from "../storage/repositories/mail-accounts.js";

interface PromptMetrics {
  characters: number;
  estimatedTokens: number;
}

export interface PromptFootprintScenarioResult {
  name: string;
  current: PromptMetrics;
  baseline: PromptMetrics;
  estimatedReductionPct: number;
  notes: string[];
}

export interface PromptFootprintBenchmarkResult {
  generatedAt: string;
  estimateMethod: string;
  transcriptFollowUpAverage: PromptFootprintScenarioResult;
  transcriptFollowUpFinalTurn: PromptFootprintScenarioResult;
  multiAgentReducer: PromptFootprintScenarioResult;
}

interface CapturedTurn {
  inputText: string;
  responseText: string;
}

const BENCHMARK_DATE = "2026-03-28T10:00:00.000Z";

export async function runPromptFootprintBenchmark(): Promise<PromptFootprintBenchmarkResult> {
  const transcriptScenario = await runTranscriptFollowUpScenario();
  const multiAgentScenario = await runMultiAgentReducerScenario();

  return {
    generatedAt: BENCHMARK_DATE,
    estimateMethod:
      "Estimated tokens use a repository-local heuristic of ceil(characters / 4); this measures prompt footprint, not provider-billed tokens.",
    transcriptFollowUpAverage: transcriptScenario.average,
    transcriptFollowUpFinalTurn: transcriptScenario.finalTurn,
    multiAgentReducer: multiAgentScenario
  };
}

async function runTranscriptFollowUpScenario() {
  const { config, handle, cleanup } = createDb();
  const orchestratorTurns: CapturedTurn[] = [];
  const inboundBodies: string[] = [];

  try {
    const executor: MailAgentExecutor = {
      async executeMailTurn(request) {
        const responseText = buildShortSummary(`turn-${orchestratorTurns.length + 1}`);
        orchestratorTurns.push({
          inputText: request.inputText,
          responseText
        });
        return buildExecutionResult(responseText);
      }
    };

    let previousMessageId: string | undefined;
    for (let index = 0; index < 6; index += 1) {
      const messageId = `<benchmark-thread-${index + 1}@example.com>`;
      const body = buildLongBody(
        `Turn ${index + 1} request about Atlas rollout, budget tracking, customer commitments, and escalation handling`,
        5
      );
      inboundBodies.push(body);

      ingestIncomingMail(
        {
          db: handle.db,
          config
        },
        {
          accountId: "acct-benchmark",
          mailboxAddress: "mailclaws@example.com",
          envelope: buildEnvelope({
            providerMessageId: `provider-thread-${index + 1}`,
            messageId,
            headers: buildHeaders(messageId, previousMessageId),
            text: body,
            attachments: []
          })
        }
      );

      await processNextRoomJob({
        db: handle.db,
        config,
        agentExecutor: executor
      });

      previousMessageId = messageId;
    }

    if (orchestratorTurns.length < 2) {
      throw new Error("expected follow-up orchestrator turns for prompt footprint benchmark");
    }

    const followUpResults: PromptFootprintScenarioResult[] = [];
    for (let turnIndex = 1; turnIndex < orchestratorTurns.length; turnIndex += 1) {
      const currentPrompt = orchestratorTurns[turnIndex]?.inputText ?? "";
      const promptPrefix = stripPromptSection(currentPrompt, "Latest room pre snapshot:");
      const historyTranscript = buildConversationTranscript(
        inboundBodies.slice(0, turnIndex),
        orchestratorTurns.slice(0, turnIndex).map((turn) => turn.responseText)
      );
      const baselinePrompt = [promptPrefix, "Full session transcript context:", historyTranscript]
        .filter((section) => section.trim().length > 0)
        .join("\n\n");
      const current = measureText(currentPrompt);
      const baseline = measureText(baselinePrompt);

      followUpResults.push({
        name: `Transcript follow-up turn ${turnIndex + 1}`,
        current,
        baseline,
        estimatedReductionPct: calculateReductionPct(current.estimatedTokens, baseline.estimatedTokens),
        notes: [
          "Current prompt uses the latest inbound plus the persisted room pre snapshot.",
          "Baseline approximates a session-first prompt that replays the full prior user/assistant transcript."
        ]
      });
    }

    const averageCurrentTokens = average(
      followUpResults.map((result) => result.current.estimatedTokens)
    );
    const averageBaselineTokens = average(
      followUpResults.map((result) => result.baseline.estimatedTokens)
    );
    const averageCurrentCharacters = average(
      followUpResults.map((result) => result.current.characters)
    );
    const averageBaselineCharacters = average(
      followUpResults.map((result) => result.baseline.characters)
    );

    return {
      average: {
        name: "Transcript follow-up average",
        current: {
          characters: Math.round(averageCurrentCharacters),
          estimatedTokens: Math.round(averageCurrentTokens)
        },
        baseline: {
          characters: Math.round(averageBaselineCharacters),
          estimatedTokens: Math.round(averageBaselineTokens)
        },
        estimatedReductionPct: calculateReductionPct(averageCurrentTokens, averageBaselineTokens),
        notes: [
          "Average across five real follow-up turns in one room.",
          "Each turn reused the persisted Pre snapshot instead of replaying the full prior transcript."
        ]
      },
      finalTurn: followUpResults[followUpResults.length - 1] as PromptFootprintScenarioResult
    };
  } finally {
    handle.close();
    cleanup();
  }
}

async function runMultiAgentReducerScenario(): Promise<PromptFootprintScenarioResult> {
  const { config, handle, cleanup } = createDb({
    MAILCLAW_FEATURE_SWARM_WORKERS: "true"
  });
  const requests: ExecuteMailTurnInput[] = [];
  const responses = new Map<string, string>();

  try {
    upsertMailAccount(handle.db, {
      accountId: "acct-benchmark",
      provider: "imap",
      emailAddress: "assistant@ai.example.com",
      status: "active",
      settings: {
        routing: {
          publicAliases: ["assistant@ai.example.com"],
          plusRoleAliases: {
            draft: "mail-drafter"
          }
        }
      },
      createdAt: BENCHMARK_DATE,
      updatedAt: BENCHMARK_DATE
    });

    const executor: MailAgentExecutor = {
      async executeMailTurn(request) {
        requests.push(request);
        const responseText = buildRoleSpecificResponse(request);
        responses.set(request.sessionKey, responseText);
        return buildExecutionResult(responseText);
      }
    };

    const messageId = "<benchmark-multi-agent-1@example.com>";
    const ingested = ingestIncomingMail(
      {
        db: handle.db,
        config
      },
      {
        accountId: "acct-benchmark",
        mailboxAddress: "assistant@ai.example.com",
        envelope: buildEnvelope({
          providerMessageId: "provider-multi-agent-1",
          messageId,
          to: [{ email: "assistant+draft@ai.example.com" }],
          headers: buildHeaders(messageId),
          text: buildLongBody(
            "Need a customer-ready reply that confirms the Atlas owner, cites attachment evidence, and explains the current escalation path",
            4
          ),
          attachments: [
            {
              filename: "atlas.txt",
              mimeType: "text/plain",
              size: 128,
              data:
                "Atlas owner is Dana. Escalation path is Lee. Renewal closes on Friday. Include only verified facts."
            }
          ]
        })
      }
    );

    await processNextRoomJob({
      db: handle.db,
      config,
      agentExecutor: executor
    });

    const replay = replayRoom(handle.db, ingested.roomKey);
    if (replay.preSnapshots.length === 0) {
      throw new Error("expected persisted pre snapshots in multi-agent benchmark");
    }

    const orchestratorRequest = requests.find((request) => !request.sessionKey.includes(":agent:"));
    const workerRequests = requests.filter((request) => request.sessionKey.includes(":agent:"));
    if (!orchestratorRequest || workerRequests.length === 0) {
      throw new Error("expected orchestrator and worker requests in multi-agent benchmark");
    }
    if (!orchestratorRequest.inputText.includes("Worker summaries:")) {
      throw new Error("expected worker summaries in orchestrator prompt");
    }

    const promptPrefix = stripPromptSection(orchestratorRequest.inputText, "Worker summaries:");
    const fullWorkerTranscript = workerRequests
      .map((request) => {
        const role = request.sessionKey.split(":agent:")[1] ?? request.sessionKey;
        return [
          `[${role}] prompt`,
          request.inputText,
          `[${role}] raw response`,
          responses.get(request.sessionKey) ?? ""
        ].join("\n");
      })
      .join("\n\n");
    const baselinePrompt = [promptPrefix, "Full worker transcript context:", fullWorkerTranscript]
      .filter((section) => section.trim().length > 0)
      .join("\n\n");
    const current = measureText(orchestratorRequest.inputText);
    const baseline = measureText(baselinePrompt);

    return {
      name: "Multi-agent reducer handoff",
      current,
      baseline,
      estimatedReductionPct: calculateReductionPct(current.estimatedTokens, baseline.estimatedTokens),
      notes: [
        `Worker count: ${workerRequests.length}`,
        "Current prompt keeps reducer summaries and draft snippets instead of replaying each worker prompt/output transcript."
      ]
    };
  } finally {
    handle.close();
    cleanup();
  }
}

function createDb(extraEnv: Record<string, string> = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaws-benchmark-"));
  const config = loadConfig({
    MAILCLAW_STATE_DIR: tempDir,
    MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaws.sqlite"),
    MAILCLAW_FEATURE_MAIL_INGEST: "true",
    MAILCLAW_FEATURE_OPENCLAW_BRIDGE: "true",
    ...extraEnv
  });

  return {
    config,
    handle: initializeDatabase(config),
    cleanup: () => fs.rmSync(tempDir, { recursive: true, force: true })
  };
}

function buildEnvelope(overrides: Partial<ProviderMailEnvelope> = {}): ProviderMailEnvelope {
  return {
    providerMessageId: "provider-1",
    messageId: "<msg-1@example.com>",
    subject: "Quarterly review",
    from: {
      email: "sender@example.com",
      name: "Sender"
    },
    to: [
      {
        email: "mailclaws@example.com"
      }
    ],
    headers: [
      {
        name: "Message-ID",
        value: "<msg-1@example.com>"
      }
    ],
    text: "Please summarize the latest attachment.",
    attachments: [],
    ...overrides
  };
}

function buildHeaders(messageId: string, previousMessageId?: string) {
  const headers = [
    {
      name: "Message-ID",
      value: messageId
    }
  ];

  if (previousMessageId) {
    headers.push(
      {
        name: "In-Reply-To",
        value: previousMessageId
      },
      {
        name: "References",
        value: previousMessageId
      }
    );
  }

  return headers;
}

function buildExecutionResult(responseText: string) {
  return {
    startedAt: BENCHMARK_DATE,
    completedAt: BENCHMARK_DATE,
    responseText,
    request: {
      url: "http://127.0.0.1:11437/v1/responses",
      method: "POST" as const,
      headers: {},
      body: {}
    }
  };
}

function buildShortSummary(label: string) {
  return `${label}: confirmed the latest room state, kept only reusable facts, and prepared the next outward-facing reply without replaying the full transcript.`;
}

function buildLongBody(topic: string, paragraphCount: number) {
  return Array.from({ length: paragraphCount }, (_, index) => {
    const paragraphNumber = index + 1;
    return `${topic}. Paragraph ${paragraphNumber} records customer context, pending questions, verified names, budget assumptions, and delivery constraints so the benchmark can model a realistically long email body without relying on lorem ipsum.`;
  }).join("\n\n");
}

function buildConversationTranscript(userTurns: string[], assistantTurns: string[]) {
  const entries: string[] = [];

  for (let index = 0; index < userTurns.length; index += 1) {
    entries.push(`User turn ${index + 1}:\n${userTurns[index] ?? ""}`);
    entries.push(`Assistant turn ${index + 1}:\n${assistantTurns[index] ?? ""}`);
  }

  return entries.join("\n\n");
}

function buildRoleSpecificResponse(request: ExecuteMailTurnInput) {
  if (request.sessionKey.endsWith(":agent:mail-attachment-reader")) {
    return JSON.stringify({
      summary:
        "Attachment reader extracted the Atlas owner, escalation path, deadline language, and the instruction to cite only verified attachment-backed facts.",
      facts: [
        {
          claim: "Atlas owner is Dana.",
          evidenceRef: "artifact://atlas/chunk/1"
        },
        {
          claim: "Escalation path is Lee.",
          evidenceRef: "artifact://atlas/chunk/2"
        }
      ],
      open_questions: ["Should the reply restate the Friday renewal cutoff?"],
      recommended_action: "Use only the verified attachment facts in the customer-facing reply."
    });
  }

  if (request.sessionKey.endsWith(":agent:mail-researcher")) {
    return JSON.stringify({
      summary:
        "Research cross-checked the room context, found no contradictory owner record, and confirmed the reply can stay concise as long as it mentions Dana and Lee explicitly.",
      facts: [
        {
          claim: "No conflicting owner record was found in retrieved room context.",
          evidenceRef: "search://room/context/1"
        }
      ],
      open_questions: ["Do we need to mention that renewal closes on Friday?"],
      recommended_action: "Draft a short reply that confirms the owner and offers the escalation path."
    });
  }

  if (request.sessionKey.endsWith(":agent:mail-drafter")) {
    return JSON.stringify({
      summary:
        "Drafted a customer-ready reply that confirms Dana as owner, names Lee as escalation contact, and avoids speculative delivery promises.",
      draft_reply:
        "Dana currently owns Atlas, and Lee remains the escalation contact. If you want, I can also send the Friday renewal checkpoint in a separate follow-up."
    });
  }

  if (request.sessionKey.endsWith(":agent:mail-reviewer")) {
    return JSON.stringify({
      summary:
        "Reviewer confirmed that the draft stays within verified facts and does not leak any hidden or unverified details."
    });
  }

  if (request.sessionKey.endsWith(":agent:mail-guard")) {
    return JSON.stringify({
      summary:
        "Guard allows the reply path because the message stays internal until the orchestrator creates the governed outbox intent."
    });
  }

  return "Dana currently owns Atlas, Lee remains the escalation contact, and we can send a short customer-safe follow-up.";
}

function stripPromptSection(prompt: string, marker: string) {
  const index = prompt.indexOf(marker);
  return index >= 0 ? prompt.slice(0, index).trimEnd() : prompt.trimEnd();
}

function measureText(text: string): PromptMetrics {
  return {
    characters: text.length,
    estimatedTokens: Math.ceil(text.length / 4)
  };
}

function calculateReductionPct(currentTokens: number, baselineTokens: number) {
  if (baselineTokens <= 0) {
    return 0;
  }

  return Number((((baselineTokens - currentTokens) / baselineTokens) * 100).toFixed(1));
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
