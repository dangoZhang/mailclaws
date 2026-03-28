import type { DatabaseSync } from "node:sqlite";

export type OAuthLoginSessionStatus = "pending" | "completed" | "failed" | "expired";

export interface OAuthLoginSessionRecord {
  sessionId: string;
  provider: string;
  accountId: string;
  loginHint?: string;
  displayName?: string;
  state: string;
  codeVerifier: string;
  redirectUri: string;
  scopes: string[];
  settings: Record<string, unknown>;
  status: OAuthLoginSessionStatus;
  resolvedEmailAddress?: string;
  errorText?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export function upsertOAuthLoginSession(db: DatabaseSync, session: OAuthLoginSessionRecord) {
  db.prepare(
    `
      INSERT INTO oauth_login_sessions (
        session_id,
        provider,
        account_id,
        login_hint,
        display_name,
        state,
        code_verifier,
        redirect_uri,
        scopes_json,
        settings_json,
        status,
        resolved_email_address,
        error_text,
        created_at,
        updated_at,
        completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id) DO UPDATE SET
        provider = excluded.provider,
        account_id = excluded.account_id,
        login_hint = excluded.login_hint,
        display_name = excluded.display_name,
        state = excluded.state,
        code_verifier = excluded.code_verifier,
        redirect_uri = excluded.redirect_uri,
        scopes_json = excluded.scopes_json,
        settings_json = excluded.settings_json,
        status = excluded.status,
        resolved_email_address = excluded.resolved_email_address,
        error_text = excluded.error_text,
        updated_at = excluded.updated_at,
        completed_at = excluded.completed_at;
    `
  ).run(
    session.sessionId,
    session.provider,
    session.accountId,
    session.loginHint ?? null,
    session.displayName ?? null,
    session.state,
    session.codeVerifier,
    session.redirectUri,
    JSON.stringify(session.scopes),
    JSON.stringify(session.settings),
    session.status,
    session.resolvedEmailAddress ?? null,
    session.errorText ?? null,
    session.createdAt,
    session.updatedAt,
    session.completedAt ?? null
  );
}

export function getOAuthLoginSession(db: DatabaseSync, sessionId: string) {
  const row = db
    .prepare(
      `
        SELECT
          session_id,
          provider,
          account_id,
          login_hint,
          display_name,
          state,
          code_verifier,
          redirect_uri,
          scopes_json,
          settings_json,
          status,
          resolved_email_address,
          error_text,
          created_at,
          updated_at,
          completed_at
        FROM oauth_login_sessions
        WHERE session_id = ?
        LIMIT 1;
      `
    )
    .get(sessionId) as OAuthLoginSessionRow | undefined;

  return row ? mapOAuthLoginSessionRow(row) : null;
}

export function getOAuthLoginSessionByState(db: DatabaseSync, state: string) {
  const row = db
    .prepare(
      `
        SELECT
          session_id,
          provider,
          account_id,
          login_hint,
          display_name,
          state,
          code_verifier,
          redirect_uri,
          scopes_json,
          settings_json,
          status,
          resolved_email_address,
          error_text,
          created_at,
          updated_at,
          completed_at
        FROM oauth_login_sessions
        WHERE state = ?
        LIMIT 1;
      `
    )
    .get(state) as OAuthLoginSessionRow | undefined;

  return row ? mapOAuthLoginSessionRow(row) : null;
}

function mapOAuthLoginSessionRow(row: OAuthLoginSessionRow): OAuthLoginSessionRecord {
  return {
    sessionId: row.session_id,
    provider: row.provider,
    accountId: row.account_id,
    loginHint: row.login_hint ?? undefined,
    displayName: row.display_name ?? undefined,
    state: row.state,
    codeVerifier: row.code_verifier,
    redirectUri: row.redirect_uri,
    scopes: JSON.parse(row.scopes_json) as string[],
    settings: JSON.parse(row.settings_json) as Record<string, unknown>,
    status: row.status,
    resolvedEmailAddress: row.resolved_email_address ?? undefined,
    errorText: row.error_text ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? undefined
  };
}

interface OAuthLoginSessionRow {
  session_id: string;
  provider: string;
  account_id: string;
  login_hint: string | null;
  display_name: string | null;
  state: string;
  code_verifier: string;
  redirect_uri: string;
  scopes_json: string;
  settings_json: string;
  status: OAuthLoginSessionStatus;
  resolved_email_address: string | null;
  error_text: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}
