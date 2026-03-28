import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { AppConfig } from "../config.js";
import type { EmbeddedRuntimeSessionSummary } from "../core/types.js";

export interface EmbeddedTranscriptEntry {
  role: "user" | "assistant";
  text: string;
}

export interface EmbeddedSessionState {
  sessionId: string;
  sessionKey: string;
  createdAt: string;
  updatedAt: string;
  turnCount: number;
}

export interface EmbeddedRuntimeSessionRecord {
  state: EmbeddedSessionState;
  statePath: string;
  transcriptPath: string;
  history: EmbeddedTranscriptEntry[];
}

export interface EmbeddedRuntimeSessionManager {
  describeSession(sessionKey: string, now: string): EmbeddedRuntimeSessionRecord;
  appendTranscriptEntries(sessionKey: string, entries: EmbeddedTranscriptEntry[]): EmbeddedRuntimeSessionRecord;
  listSessions(input?: {
    sessionKey?: string;
    sessionId?: string;
  }): EmbeddedRuntimeSessionSummary[];
}

export function createFileBackedEmbeddedSessionManager(
  config: AppConfig
): EmbeddedRuntimeSessionManager {
  const sessionsDir = path.join(config.storage.stateDir, "embedded-runtime", "sessions");

  return {
    describeSession(sessionKey, now) {
      const sessionId = stableSessionId(sessionKey);
      const sessionDir = path.join(sessionsDir, sessionId);
      const transcriptPath = path.join(sessionDir, "transcript.jsonl");
      const statePath = path.join(sessionDir, "state.json");

      fs.mkdirSync(sessionDir, { recursive: true });

      const state = readSessionState(statePath) ?? {
        sessionId,
        sessionKey,
        createdAt: now,
        updatedAt: now,
        turnCount: 0
      };

      writeSessionState(statePath, state);
      if (!fs.existsSync(transcriptPath)) {
        fs.writeFileSync(transcriptPath, "", "utf8");
      }

      return {
        state,
        statePath,
        transcriptPath,
        history: readTranscript(transcriptPath)
      };
    },
    appendTranscriptEntries(sessionKey, entries) {
      const current = this.describeSession(sessionKey, new Date().toISOString());
      appendTranscriptEntries(current.transcriptPath, entries);
      const updatedAt = new Date().toISOString();
      const nextState: EmbeddedSessionState = {
        ...current.state,
        updatedAt,
        turnCount: current.history.length / 2 + 1
      };
      writeSessionState(current.statePath, nextState);

      return {
        state: nextState,
        statePath: current.statePath,
        transcriptPath: current.transcriptPath,
        history: [...current.history, ...entries]
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
            const state = JSON.parse(fs.readFileSync(statePath, "utf8")) as EmbeddedSessionState;
            const history = readTranscript(transcriptPath);
            const lastEntry = history.at(-1) ?? null;
            const summary: EmbeddedRuntimeSessionSummary = {
              sessionId: state.sessionId,
              sessionKey: state.sessionKey,
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

export function stableSessionId(sessionKey: string) {
  return createHash("sha256").update(sessionKey).digest("hex").slice(0, 16);
}

function readSessionState(statePath: string) {
  if (!fs.existsSync(statePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(statePath, "utf8")) as EmbeddedSessionState;
}

function writeSessionState(statePath: string, state: EmbeddedSessionState) {
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf8");
}

function readTranscript(transcriptPath: string): EmbeddedTranscriptEntry[] {
  if (!fs.existsSync(transcriptPath)) {
    return [];
  }

  const content = fs.readFileSync(transcriptPath, "utf8").trim();
  if (!content) {
    return [];
  }

  return content
    .split("\n")
    .map((line) => JSON.parse(line) as EmbeddedTranscriptEntry);
}

function appendTranscriptEntries(transcriptPath: string, entries: EmbeddedTranscriptEntry[]) {
  const payload = entries.map((entry) => JSON.stringify(entry)).join("\n");
  const prefix =
    fs.existsSync(transcriptPath) && fs.readFileSync(transcriptPath, "utf8").length > 0 ? "\n" : "";
  fs.appendFileSync(transcriptPath, `${prefix}${payload}`, "utf8");
}

function summarizeText(value: string) {
  const normalized = value.replaceAll(/\s+/g, " ").trim();
  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
}
