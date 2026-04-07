import fs from "node:fs";
import path from "node:path";

import type { AppConfig } from "../config.js";
import type { BridgeRuntimeSessionSummary } from "../core/types.js";
import { stableSessionId } from "../runtime/embedded-session-manager.js";

export interface OpenClawBridgeTranscriptEntry {
  role: "user" | "assistant";
  text: string;
}

export interface OpenClawBridgeSessionState {
  sessionId: string;
  sessionKey: string;
  agentId: string;
  createdAt: string;
  updatedAt: string;
  turnCount: number;
}

export interface OpenClawBridgeSessionRecord {
  state: OpenClawBridgeSessionState;
  statePath: string;
  transcriptPath: string;
  history: OpenClawBridgeTranscriptEntry[];
  transportHeaders: Record<string, string>;
  metadata: Record<string, string>;
}

export interface OpenClawBridgeSessionManager {
  describeSession(input: {
    sessionKey: string;
    agentId: string;
    now: string;
  }): OpenClawBridgeSessionRecord;
  appendTranscriptEntries(input: {
    sessionKey: string;
    agentId: string;
    entries: OpenClawBridgeTranscriptEntry[];
    now?: string;
  }): OpenClawBridgeSessionRecord;
  listSessions(input?: {
    sessionKey?: string;
    sessionId?: string;
  }): BridgeRuntimeSessionSummary[];
}

export function createFileBackedOpenClawBridgeSessionManager(
  config: AppConfig
): OpenClawBridgeSessionManager {
  const sessionsDir = path.join(config.storage.stateDir, "openclaw-bridge", "sessions");

  return {
    describeSession(input) {
      const sessionId = stableSessionId(input.sessionKey);
      const sessionDir = path.join(sessionsDir, sessionId);
      const statePath = path.join(sessionDir, "state.json");
      const transcriptPath = path.join(sessionDir, "transcript.jsonl");

      fs.mkdirSync(sessionDir, { recursive: true });

      const state = readSessionState(statePath) ?? {
        sessionId,
        sessionKey: input.sessionKey,
        agentId: input.agentId,
        createdAt: input.now,
        updatedAt: input.now,
        turnCount: 0
      };
      const nextState: OpenClawBridgeSessionState = {
        ...state,
        agentId: input.agentId,
        updatedAt: input.now
      };

      writeSessionState(statePath, nextState);
      if (!fs.existsSync(transcriptPath)) {
        fs.writeFileSync(transcriptPath, "", "utf8");
      }

      return {
        state: nextState,
        statePath,
        transcriptPath,
        history: readTranscript(transcriptPath),
        transportHeaders: {
          "x-mailclaws-bridge-session-id": nextState.sessionId
        },
        metadata: {
          mailclaw_bridge_session_id: nextState.sessionId,
          mailclaw_bridge_agent_id: nextState.agentId
        }
      };
    },
    appendTranscriptEntries(input) {
      const current = this.describeSession({
        sessionKey: input.sessionKey,
        agentId: input.agentId,
        now: input.now ?? new Date().toISOString()
      });
      appendTranscriptEntries(current.transcriptPath, input.entries);
      const updatedAt = input.now ?? new Date().toISOString();
      const nextState: OpenClawBridgeSessionState = {
        ...current.state,
        agentId: input.agentId,
        updatedAt,
        turnCount: current.history.length / 2 + 1
      };
      writeSessionState(current.statePath, nextState);

      return {
        ...current,
        state: nextState,
        history: [...current.history, ...input.entries],
        metadata: {
          ...current.metadata,
          mailclaw_bridge_agent_id: input.agentId
        }
      };
    },
    listSessions(input = {}) {
      if (!fs.existsSync(sessionsDir)) {
        return [];
      }

      const summaries = fs
        .readdirSync(sessionsDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .flatMap((entry) => {
          const statePath = path.join(sessionsDir, entry.name, "state.json");
          const transcriptPath = path.join(sessionsDir, entry.name, "transcript.jsonl");
          if (!fs.existsSync(statePath) || !fs.existsSync(transcriptPath)) {
            return [];
          }

          try {
            const state = readSessionState(statePath);
            if (!state) {
              return [];
            }
            const history = readTranscript(transcriptPath);
            const lastEntry = history.at(-1) ?? null;
            const summary: BridgeRuntimeSessionSummary = {
              sessionId: state.sessionId,
              sessionKey: state.sessionKey,
              agentId: state.agentId ?? null,
              createdAt: state.createdAt,
              updatedAt: state.updatedAt,
              turnCount: state.turnCount,
              transcriptEntryCount: history.length,
              statePath,
              transcriptPath,
              lastEntryRole: lastEntry?.role ?? null,
              lastEntryPreview: lastEntry ? summarizeText(lastEntry.text) : null
            };

            if (input.sessionKey && summary.sessionKey !== input.sessionKey) {
              return [];
            }
            if (input.sessionId && summary.sessionId !== input.sessionId) {
              return [];
            }

            return [summary];
          } catch {
            return [];
          }
        });

      return summaries.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    }
  };
}

function readSessionState(statePath: string) {
  if (!fs.existsSync(statePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(statePath, "utf8")) as OpenClawBridgeSessionState;
}

function writeSessionState(statePath: string, state: OpenClawBridgeSessionState) {
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf8");
}

function readTranscript(transcriptPath: string): OpenClawBridgeTranscriptEntry[] {
  if (!fs.existsSync(transcriptPath)) {
    return [];
  }

  const content = fs.readFileSync(transcriptPath, "utf8").trim();
  if (!content) {
    return [];
  }

  return content.split("\n").map((line) => JSON.parse(line) as OpenClawBridgeTranscriptEntry);
}

function appendTranscriptEntries(transcriptPath: string, entries: OpenClawBridgeTranscriptEntry[]) {
  const payload = entries.map((entry) => JSON.stringify(entry)).join("\n");
  const prefix =
    fs.existsSync(transcriptPath) && fs.readFileSync(transcriptPath, "utf8").length > 0 ? "\n" : "";
  fs.appendFileSync(transcriptPath, `${prefix}${payload}`, "utf8");
}

function summarizeText(value: string) {
  const normalized = value.replaceAll(/\s+/g, " ").trim();
  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
}
