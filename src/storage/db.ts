import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { AppConfig } from "../config.js";
import { backfillOutboxControlPlane } from "./repositories/outbox-intents.js";

const SCHEMA_VERSION = 31;

export interface DatabaseHandle {
  db: DatabaseSync;
  path: string;
  close(): void;
}

export function initializeDatabase(config: AppConfig): DatabaseHandle {
  fs.mkdirSync(path.dirname(config.storage.sqlitePath), { recursive: true });

  const db = new DatabaseSync(config.storage.sqlitePath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      version INTEGER NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS thread_rooms (
      room_key TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      stable_thread_id TEXT NOT NULL,
      parent_session_key TEXT NOT NULL,
      front_agent_address TEXT,
      public_agent_addresses_json TEXT NOT NULL DEFAULT '[]',
      collaborator_agent_addresses_json TEXT NOT NULL DEFAULT '[]',
      summoned_roles_json TEXT NOT NULL DEFAULT '[]',
      state TEXT NOT NULL,
      revision INTEGER NOT NULL,
      last_inbound_seq INTEGER NOT NULL,
      last_outbound_seq INTEGER NOT NULL,
      summary_ref TEXT,
      shared_facts_ref TEXT
    );
  `);
  ensureThreadRoomColumns(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS mail_accounts (
      account_id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      email_address TEXT NOT NULL,
      display_name TEXT,
      status TEXT NOT NULL,
      settings_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS provider_cursors (
      account_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      cursor_kind TEXT NOT NULL,
      cursor_value TEXT NOT NULL,
      metadata_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(account_id, cursor_kind),
      FOREIGN KEY(account_id) REFERENCES mail_accounts(account_id)
    );
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_provider_cursors_provider
    ON provider_cursors (provider, cursor_kind, updated_at DESC);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS provider_events (
      provider_event_id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      room_key TEXT,
      dedupe_key TEXT,
      event_type TEXT NOT NULL,
      cursor_value TEXT,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(room_key) REFERENCES thread_rooms(room_key),
      FOREIGN KEY(dedupe_key) REFERENCES mail_messages(dedupe_key)
    );
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_provider_events_account
    ON provider_events (account_id, created_at ASC);
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_provider_events_room
    ON provider_events (room_key, created_at ASC);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS oauth_login_sessions (
      session_id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      account_id TEXT NOT NULL,
      login_hint TEXT,
      display_name TEXT,
      state TEXT NOT NULL UNIQUE,
      code_verifier TEXT NOT NULL,
      redirect_uri TEXT NOT NULL,
      scopes_json TEXT NOT NULL,
      settings_json TEXT NOT NULL,
      status TEXT NOT NULL,
      resolved_email_address TEXT,
      error_text TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    );
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_oauth_login_sessions_provider
    ON oauth_login_sessions (provider, status, created_at DESC);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS worker_sessions (
      session_key TEXT PRIMARY KEY,
      room_key TEXT NOT NULL,
      role TEXT NOT NULL,
      revision INTEGER NOT NULL,
      state TEXT NOT NULL,
      FOREIGN KEY(room_key) REFERENCES thread_rooms(room_key)
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_nodes (
      node_id TEXT PRIMARY KEY,
      room_key TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
      role TEXT NOT NULL,
      depends_on_json TEXT NOT NULL,
      input_refs_json TEXT NOT NULL,
      deadline_ms INTEGER,
      priority INTEGER NOT NULL,
      status TEXT NOT NULL,
      task_class TEXT NOT NULL DEFAULT 'worker_execution',
      mail_task_kind TEXT,
      mail_task_stage TEXT,
      title TEXT,
      summary_text TEXT,
      next_action TEXT,
      FOREIGN KEY(room_key) REFERENCES thread_rooms(room_key)
    );
  `);
  ensureTaskNodeColumns(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS thread_ledger (
      room_key TEXT NOT NULL,
      seq INTEGER NOT NULL,
      revision INTEGER NOT NULL,
      type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(room_key, seq),
      FOREIGN KEY(room_key) REFERENCES thread_rooms(room_key)
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS room_pre_snapshots (
      snapshot_id TEXT PRIMARY KEY,
      room_key TEXT NOT NULL,
      room_revision INTEGER NOT NULL,
      kind TEXT NOT NULL,
      audience TEXT NOT NULL,
      summary TEXT NOT NULL,
      facts_json TEXT NOT NULL,
      open_questions_json TEXT NOT NULL,
      decisions_json TEXT NOT NULL,
      commitments_json TEXT NOT NULL,
      requested_actions_json TEXT NOT NULL,
      draft_body TEXT,
      inputs_hash TEXT NOT NULL,
      created_by_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(room_key) REFERENCES thread_rooms(room_key)
    );
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_room_pre_snapshots_room
    ON room_pre_snapshots (room_key, created_at ASC, snapshot_id ASC);
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_room_pre_snapshots_room_revision
    ON room_pre_snapshots (room_key, room_revision DESC, created_at DESC);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS room_participants (
      participant_key TEXT PRIMARY KEY,
      room_key TEXT NOT NULL,
      email_address TEXT,
      display_name TEXT,
      participant_type TEXT NOT NULL,
      visibility TEXT NOT NULL,
      role TEXT,
      source TEXT NOT NULL,
      joined_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      FOREIGN KEY(room_key) REFERENCES thread_rooms(room_key)
    );
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_room_participants_room
    ON room_participants (room_key, participant_type, visibility, joined_at ASC);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS room_queue_jobs (
      job_id TEXT PRIMARY KEY,
      room_key TEXT NOT NULL,
      revision INTEGER NOT NULL,
      inbound_seq INTEGER NOT NULL,
      message_dedupe_key TEXT,
      priority INTEGER NOT NULL,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL,
      lease_owner TEXT,
      lease_expires_at TEXT,
      available_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      FOREIGN KEY(room_key) REFERENCES thread_rooms(room_key)
    );
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_room_queue_jobs_lookup
    ON room_queue_jobs (status, available_at, priority DESC, created_at ASC);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS mail_threads (
      stable_thread_id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      provider_thread_id TEXT,
      normalized_subject TEXT NOT NULL,
      participant_fingerprint TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_message_at TEXT NOT NULL
    );
  `);
  db.exec("DROP INDEX IF EXISTS idx_mail_threads_provider_thread;");
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_mail_threads_provider_thread
    ON mail_threads (account_id, provider_thread_id, last_message_at DESC)
    WHERE provider_thread_id IS NOT NULL;
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_mail_threads_subject_participants
    ON mail_threads (account_id, normalized_subject, participant_fingerprint, last_message_at DESC);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS mail_messages (
      dedupe_key TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      stable_thread_id TEXT NOT NULL,
      provider_message_id TEXT,
      internet_message_id TEXT NOT NULL,
      in_reply_to TEXT,
      references_json TEXT NOT NULL,
      mailbox_address TEXT,
      raw_subject TEXT,
      text_body TEXT,
      html_body TEXT,
      from_json TEXT,
      to_json TEXT,
      cc_json TEXT,
      bcc_json TEXT,
      reply_to_json TEXT,
      normalized_subject TEXT NOT NULL,
      participant_fingerprint TEXT NOT NULL,
      received_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(stable_thread_id) REFERENCES mail_threads(stable_thread_id)
    );
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_mail_messages_message_id
    ON mail_messages (account_id, internet_message_id);
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_mail_messages_room_received
    ON mail_messages (stable_thread_id, received_at DESC);
  `);
  ensureMailMessageColumns(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS mail_runs (
      run_id TEXT PRIMARY KEY,
      room_key TEXT NOT NULL,
      job_id TEXT NOT NULL,
      revision INTEGER NOT NULL,
      status TEXT NOT NULL,
      request_json TEXT,
      response_text TEXT,
      error_text TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(room_key) REFERENCES thread_rooms(room_key)
    );
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_mail_runs_room
    ON mail_runs (room_key, created_at DESC);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS outbox_intents (
      intent_id TEXT PRIMARY KEY,
      legacy_outbox_id TEXT NOT NULL UNIQUE,
      room_key TEXT NOT NULL,
      run_id TEXT,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      subject TEXT NOT NULL,
      text_body TEXT NOT NULL,
      html_body TEXT,
      to_json TEXT NOT NULL,
      cc_json TEXT NOT NULL,
      bcc_json TEXT NOT NULL,
      headers_json TEXT NOT NULL,
      provider_message_id TEXT,
      error_text TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(room_key) REFERENCES thread_rooms(room_key),
      FOREIGN KEY(run_id) REFERENCES mail_runs(run_id)
    );
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_outbox_intents_room
    ON outbox_intents (room_key, created_at ASC);
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_outbox_intents_reference
    ON outbox_intents (legacy_outbox_id, created_at ASC);
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_outbox_intents_status
    ON outbox_intents (status, created_at ASC);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS approval_requests (
      request_id TEXT PRIMARY KEY,
      legacy_outbox_id TEXT NOT NULL UNIQUE,
      room_key TEXT NOT NULL,
      run_id TEXT,
      status TEXT NOT NULL,
      subject TEXT NOT NULL,
      to_json TEXT NOT NULL,
      cc_json TEXT NOT NULL,
      bcc_json TEXT NOT NULL,
      requested_at TEXT NOT NULL,
      decided_at TEXT,
      error_text TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(room_key) REFERENCES thread_rooms(room_key),
      FOREIGN KEY(run_id) REFERENCES mail_runs(run_id)
    );
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_approval_requests_room
    ON approval_requests (room_key, created_at ASC);
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_approval_requests_status
    ON approval_requests (status, requested_at ASC);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_aggregates (
      project_id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      project_key TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      room_count INTEGER NOT NULL,
      active_room_count INTEGER NOT NULL,
      latest_summary TEXT,
      risk_summary TEXT,
      next_action TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(account_id, project_key)
    );
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_project_aggregates_account
    ON project_aggregates (account_id, status, updated_at DESC);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS room_project_links (
      project_id TEXT NOT NULL,
      room_key TEXT NOT NULL,
      latest_revision INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(project_id, room_key),
      FOREIGN KEY(project_id) REFERENCES project_aggregates(project_id),
      FOREIGN KEY(room_key) REFERENCES thread_rooms(room_key)
    );
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_room_project_links_room
    ON room_project_links (room_key, updated_at DESC);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS scheduled_mail_jobs (
      job_id TEXT PRIMARY KEY,
      room_key TEXT NOT NULL,
      account_id TEXT NOT NULL,
      source_message_dedupe_key TEXT NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      schedule_ref TEXT NOT NULL,
      cron_like TEXT,
      next_run_at TEXT,
      last_run_at TEXT,
      follow_up_subject TEXT NOT NULL,
      follow_up_body TEXT NOT NULL,
      last_outbox_id TEXT,
      cancellation_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(room_key) REFERENCES thread_rooms(room_key),
      FOREIGN KEY(source_message_dedupe_key) REFERENCES mail_messages(dedupe_key)
    );
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_scheduled_mail_jobs_room
    ON scheduled_mail_jobs (room_key, status, updated_at DESC);
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_scheduled_mail_jobs_due
    ON scheduled_mail_jobs (status, next_run_at ASC, updated_at ASC);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_namespaces (
      namespace_key TEXT PRIMARY KEY,
      scope TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      agent_id TEXT,
      room_key TEXT,
      user_id TEXT,
      root_dir TEXT NOT NULL,
      primary_path TEXT NOT NULL,
      metadata_path TEXT,
      capabilities_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_memory_namespaces_tenant
    ON memory_namespaces (tenant_id, scope, namespace_key ASC);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS room_memory_namespaces (
      room_key TEXT NOT NULL,
      namespace_key TEXT NOT NULL,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      PRIMARY KEY(room_key, namespace_key),
      FOREIGN KEY(room_key) REFERENCES thread_rooms(room_key),
      FOREIGN KEY(namespace_key) REFERENCES memory_namespaces(namespace_key)
    );
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_room_memory_namespaces_room
    ON room_memory_namespaces (room_key, last_seen_at ASC);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_promotions (
      promotion_id TEXT PRIMARY KEY,
      room_key TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      source_namespace_key TEXT,
      target_namespace_key TEXT,
      room_memory_path TEXT,
      room_snapshot_path TEXT,
      reviewed_by TEXT,
      reviewed_at TEXT,
      approved_at TEXT,
      rejected_at TEXT,
      memory_path TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(room_key) REFERENCES thread_rooms(room_key)
    );
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_memory_promotions_room
    ON memory_promotions (room_key, created_at ASC);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS mail_outbox_attempts (
      attempt_id TEXT PRIMARY KEY,
      outbox_id TEXT NOT NULL,
      room_key TEXT NOT NULL,
      status TEXT NOT NULL,
      provider_message_id TEXT,
      error_text TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(outbox_id) REFERENCES outbox_intents(intent_id),
      FOREIGN KEY(room_key) REFERENCES thread_rooms(room_key)
    );
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_mail_outbox_attempts_room
    ON mail_outbox_attempts (room_key, created_at ASC);
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_mail_outbox_attempts_outbox
    ON mail_outbox_attempts (outbox_id, created_at ASC);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS mail_attachments (
      attachment_id TEXT PRIMARY KEY,
      room_key TEXT NOT NULL,
      message_dedupe_key TEXT NOT NULL,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER,
      content_sha256 TEXT,
      content_id TEXT,
      disposition TEXT,
      summary_text TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(room_key) REFERENCES thread_rooms(room_key),
      FOREIGN KEY(message_dedupe_key) REFERENCES mail_messages(dedupe_key)
    );
  `);
  ensureMailAttachmentColumns(db);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_mail_attachments_room
    ON mail_attachments (room_key, created_at ASC);
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_mail_attachments_room_hash
    ON mail_attachments (room_key, content_sha256, created_at ASC);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS artifact_chunks (
      artifact_chunk_id TEXT PRIMARY KEY,
      chunk_id TEXT NOT NULL,
      attachment_id TEXT NOT NULL,
      room_key TEXT NOT NULL,
      filename TEXT NOT NULL,
      chunk_path TEXT NOT NULL,
      summary_path TEXT,
      body_text TEXT NOT NULL,
      summary_text TEXT,
      token_estimate INTEGER NOT NULL,
      text_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(attachment_id) REFERENCES mail_attachments(attachment_id),
      FOREIGN KEY(room_key) REFERENCES thread_rooms(room_key)
    );
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_artifact_chunks_room
    ON artifact_chunks (room_key, attachment_id, created_at ASC);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS virtual_mailboxes (
      mailbox_id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      principal_id TEXT,
      role TEXT,
      visibility_policy_ref TEXT,
      capability_policy_ref TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_virtual_mailboxes_account
    ON virtual_mailboxes (account_id, kind, mailbox_id ASC);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS virtual_threads (
      thread_id TEXT PRIMARY KEY,
      room_key TEXT NOT NULL,
      kind TEXT NOT NULL,
      topic TEXT NOT NULL,
      parent_work_thread_id TEXT,
      created_by_message_id TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(room_key) REFERENCES thread_rooms(room_key),
      FOREIGN KEY(parent_work_thread_id) REFERENCES virtual_threads(thread_id)
    );
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_virtual_threads_room
    ON virtual_threads (room_key, created_at ASC);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS virtual_messages (
      message_id TEXT PRIMARY KEY,
      room_key TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      parent_message_id TEXT,
      message_id_header TEXT NOT NULL UNIQUE,
      in_reply_to_json TEXT NOT NULL,
      references_json TEXT NOT NULL,
      from_principal_id TEXT NOT NULL,
      from_mailbox_id TEXT NOT NULL,
      to_mailbox_ids_json TEXT NOT NULL,
      cc_mailbox_ids_json TEXT NOT NULL,
      kind TEXT NOT NULL,
      visibility TEXT NOT NULL,
      origin_kind TEXT NOT NULL DEFAULT 'virtual_internal',
      projection_metadata_json TEXT NOT NULL DEFAULT '{"origin":{"kind":"virtual_internal"}}',
      subject TEXT NOT NULL,
      body_ref TEXT NOT NULL,
      artifact_refs_json TEXT NOT NULL,
      memory_refs_json TEXT NOT NULL,
      room_revision INTEGER NOT NULL,
      inputs_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(room_key) REFERENCES thread_rooms(room_key),
      FOREIGN KEY(thread_id) REFERENCES virtual_threads(thread_id),
      FOREIGN KEY(parent_message_id) REFERENCES virtual_messages(message_id),
      FOREIGN KEY(from_mailbox_id) REFERENCES virtual_mailboxes(mailbox_id)
    );
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_virtual_messages_room
    ON virtual_messages (room_key, created_at ASC);
  `);
  ensureVirtualMessageColumns(db);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_virtual_messages_thread
    ON virtual_messages (thread_id, created_at ASC);
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_virtual_messages_origin_room
    ON virtual_messages (room_key, origin_kind, created_at ASC);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS mailbox_deliveries (
      delivery_id TEXT PRIMARY KEY,
      room_key TEXT NOT NULL,
      message_id TEXT NOT NULL,
      mailbox_id TEXT NOT NULL,
      status TEXT NOT NULL,
      lease_owner TEXT,
      lease_until TEXT,
      consumed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(message_id, mailbox_id),
      FOREIGN KEY(room_key) REFERENCES thread_rooms(room_key),
      FOREIGN KEY(message_id) REFERENCES virtual_messages(message_id),
      FOREIGN KEY(mailbox_id) REFERENCES virtual_mailboxes(mailbox_id)
    );
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_mailbox_deliveries_mailbox
    ON mailbox_deliveries (mailbox_id, status, created_at ASC);
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_mailbox_deliveries_room
    ON mailbox_deliveries (room_key, created_at ASC);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS gateway_session_bindings (
      session_key TEXT PRIMARY KEY,
      room_key TEXT NOT NULL,
      binding_kind TEXT NOT NULL,
      work_thread_id TEXT,
      parent_message_id TEXT,
      source_control_plane TEXT NOT NULL,
      front_agent_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(room_key) REFERENCES thread_rooms(room_key),
      FOREIGN KEY(work_thread_id) REFERENCES virtual_threads(thread_id),
      FOREIGN KEY(parent_message_id) REFERENCES virtual_messages(message_id)
    );
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_gateway_session_bindings_room
    ON gateway_session_bindings (room_key, updated_at DESC);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS subagent_targets (
      target_id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      mailbox_id TEXT NOT NULL UNIQUE,
      openclaw_agent_id TEXT NOT NULL,
      mode TEXT NOT NULL,
      model TEXT,
      thinking TEXT,
      run_timeout_seconds INTEGER,
      bound_session_ttl_seconds INTEGER,
      sandbox_mode TEXT NOT NULL,
      max_active_per_room INTEGER NOT NULL,
      max_queued_per_inbox INTEGER NOT NULL,
      allow_external_send INTEGER NOT NULL DEFAULT 0,
      result_schema TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(mailbox_id) REFERENCES virtual_mailboxes(mailbox_id)
    );
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_subagent_targets_account
    ON subagent_targets (account_id, enabled, mailbox_id ASC);
  `);
  const subagentTargetColumns = db
    .prepare("PRAGMA table_info(subagent_targets);")
    .all() as Array<{ name: string }>;
  if (!subagentTargetColumns.some((column) => column.name === "bound_session_ttl_seconds")) {
    db.exec("ALTER TABLE subagent_targets ADD COLUMN bound_session_ttl_seconds INTEGER;");
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS subagent_runs (
      run_id TEXT PRIMARY KEY,
      room_key TEXT NOT NULL,
      work_thread_id TEXT NOT NULL,
      parent_message_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      child_session_key TEXT NOT NULL,
      child_session_id TEXT,
      room_revision INTEGER NOT NULL,
      inputs_hash TEXT NOT NULL,
      status TEXT NOT NULL,
      result_message_id TEXT,
      error_text TEXT,
      request_json TEXT,
      announce_summary TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(room_key) REFERENCES thread_rooms(room_key),
      FOREIGN KEY(parent_message_id) REFERENCES virtual_messages(message_id),
      FOREIGN KEY(target_id) REFERENCES subagent_targets(target_id),
      FOREIGN KEY(result_message_id) REFERENCES virtual_messages(message_id)
    );
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_subagent_runs_room
    ON subagent_runs (room_key, created_at ASC);
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_subagent_runs_target
    ON subagent_runs (target_id, status, created_at ASC);
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_subagent_runs_thread_lookup
    ON subagent_runs (room_key, target_id, work_thread_id, created_at DESC);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS public_agent_inboxes (
      inbox_id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      active_room_limit INTEGER NOT NULL,
      ack_sla_seconds INTEGER NOT NULL,
      burst_coalesce_seconds INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(account_id, agent_id)
    );
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_public_agent_inboxes_account
    ON public_agent_inboxes (account_id, agent_id ASC);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS inbox_items (
      inbox_item_id TEXT PRIMARY KEY,
      inbox_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      participant_role TEXT NOT NULL DEFAULT 'front',
      room_key TEXT NOT NULL,
      latest_revision INTEGER NOT NULL,
      unread_count INTEGER NOT NULL,
      newest_message_at TEXT NOT NULL,
      state TEXT NOT NULL,
      priority INTEGER NOT NULL,
      urgency TEXT NOT NULL,
      estimated_effort TEXT NOT NULL,
      blocked_reason TEXT,
      active_worker_count INTEGER NOT NULL,
      latest_summary_ref TEXT,
      needs_ack_by TEXT,
      last_triaged_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(inbox_id, room_key),
      FOREIGN KEY(inbox_id) REFERENCES public_agent_inboxes(inbox_id),
      FOREIGN KEY(room_key) REFERENCES thread_rooms(room_key)
    );
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_inbox_items_inbox
    ON inbox_items (inbox_id, state, priority DESC, newest_message_at DESC);
  `);
  ensureInboxItemColumns(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_aggregates (
      project_id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      project_key TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      room_count INTEGER NOT NULL,
      active_room_count INTEGER NOT NULL,
      latest_summary TEXT,
      risk_summary TEXT,
      next_action TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(account_id, project_key)
    );
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_project_aggregates_account
    ON project_aggregates (account_id, updated_at DESC);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS room_project_links (
      project_id TEXT NOT NULL,
      room_key TEXT NOT NULL,
      latest_revision INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(project_id, room_key),
      FOREIGN KEY(project_id) REFERENCES project_aggregates(project_id),
      FOREIGN KEY(room_key) REFERENCES thread_rooms(room_key)
    );
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_room_project_links_room
    ON room_project_links (room_key, updated_at DESC);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS scheduled_mail_jobs (
      job_id TEXT PRIMARY KEY,
      room_key TEXT NOT NULL,
      account_id TEXT NOT NULL,
      source_message_dedupe_key TEXT NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      schedule_ref TEXT NOT NULL,
      cron_like TEXT,
      next_run_at TEXT,
      last_run_at TEXT,
      follow_up_subject TEXT NOT NULL,
      follow_up_body TEXT NOT NULL,
      last_outbox_id TEXT,
      cancellation_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(room_key) REFERENCES thread_rooms(room_key),
      FOREIGN KEY(source_message_dedupe_key) REFERENCES mail_messages(dedupe_key),
      FOREIGN KEY(last_outbox_id) REFERENCES outbox_intents(intent_id)
    );
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_scheduled_mail_jobs_room
    ON scheduled_mail_jobs (room_key, status, updated_at DESC);
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_scheduled_mail_jobs_due
    ON scheduled_mail_jobs (status, next_run_at ASC);
  `);
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS room_search_fts
    USING fts5(
      room_key UNINDEXED,
      kind UNINDEXED,
      source_id UNINDEXED,
      attachment_id UNINDEXED,
      title,
      body,
      excerpt_source,
      chunk_id UNINDEXED,
      chunk_path UNINDEXED,
      artifact_path UNINDEXED,
      created_at UNINDEXED,
      tokenize = 'porter unicode61'
    );
  `);

  db.prepare(
    `
      INSERT INTO schema_meta (id, version, applied_at)
      VALUES (1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        version = excluded.version,
      applied_at = excluded.applied_at;
    `
  ).run(SCHEMA_VERSION, new Date().toISOString());
  backfillOutboxControlPlane(db);

  return {
    db,
    path: config.storage.sqlitePath,
    close: () => db.close()
  };
}

function ensureMailMessageColumns(db: DatabaseSync) {
  const columns = db
    .prepare("PRAGMA table_info(mail_messages);")
    .all() as Array<{ name: string }>;
  const names = new Set(columns.map((column) => column.name));

  if (!names.has("canonical_user_id")) {
    db.exec("ALTER TABLE mail_messages ADD COLUMN canonical_user_id TEXT;");
  }

  if (!names.has("trust_level")) {
    db.exec("ALTER TABLE mail_messages ADD COLUMN trust_level TEXT;");
  }

  if (!names.has("identity_json")) {
    db.exec("ALTER TABLE mail_messages ADD COLUMN identity_json TEXT;");
  }
}

function ensureVirtualMessageColumns(db: DatabaseSync) {
  const columns = db
    .prepare("PRAGMA table_info(virtual_messages);")
    .all() as Array<{ name: string }>;
  const names = new Set(columns.map((column) => column.name));

  if (!names.has("origin_kind")) {
    db.exec("ALTER TABLE virtual_messages ADD COLUMN origin_kind TEXT NOT NULL DEFAULT 'virtual_internal';");
  }

  if (!names.has("projection_metadata_json")) {
    db.exec(
      "ALTER TABLE virtual_messages ADD COLUMN projection_metadata_json TEXT NOT NULL DEFAULT '{\"origin\":{\"kind\":\"virtual_internal\"}}';"
    );
  }

  db.exec(
    "UPDATE virtual_messages SET projection_metadata_json = '{\"origin\":{\"kind\":\"virtual_internal\"}}' WHERE projection_metadata_json IS NULL OR TRIM(projection_metadata_json) = '';"
  );
  db.exec(
    "UPDATE virtual_messages SET origin_kind = 'virtual_internal' WHERE origin_kind IS NULL OR TRIM(origin_kind) = '';"
  );
}

function ensureTaskNodeColumns(db: DatabaseSync) {
  const columns = db
    .prepare("PRAGMA table_info(task_nodes);")
    .all() as Array<{ name: string }>;
  const names = new Set(columns.map((column) => column.name));

  if (!names.has("revision")) {
    db.exec("ALTER TABLE task_nodes ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;");
  }

  if (!names.has("task_class")) {
    db.exec("ALTER TABLE task_nodes ADD COLUMN task_class TEXT NOT NULL DEFAULT 'worker_execution';");
  }

  if (!names.has("mail_task_kind")) {
    db.exec("ALTER TABLE task_nodes ADD COLUMN mail_task_kind TEXT;");
  }

  if (!names.has("mail_task_stage")) {
    db.exec("ALTER TABLE task_nodes ADD COLUMN mail_task_stage TEXT;");
  }

  if (!names.has("title")) {
    db.exec("ALTER TABLE task_nodes ADD COLUMN title TEXT;");
  }

  if (!names.has("summary_text")) {
    db.exec("ALTER TABLE task_nodes ADD COLUMN summary_text TEXT;");
  }

  if (!names.has("next_action")) {
    db.exec("ALTER TABLE task_nodes ADD COLUMN next_action TEXT;");
  }
}

function ensureThreadRoomColumns(db: DatabaseSync) {
  const columns = db
    .prepare("PRAGMA table_info(thread_rooms);")
    .all() as Array<{ name: string }>;
  const names = new Set(columns.map((column) => column.name));

  if (!names.has("front_agent_address")) {
    db.exec("ALTER TABLE thread_rooms ADD COLUMN front_agent_address TEXT;");
  }

  if (!names.has("public_agent_addresses_json")) {
    db.exec("ALTER TABLE thread_rooms ADD COLUMN public_agent_addresses_json TEXT NOT NULL DEFAULT '[]';");
  }

  if (!names.has("collaborator_agent_addresses_json")) {
    db.exec(
      "ALTER TABLE thread_rooms ADD COLUMN collaborator_agent_addresses_json TEXT NOT NULL DEFAULT '[]';"
    );
  }

  if (!names.has("summoned_roles_json")) {
    db.exec("ALTER TABLE thread_rooms ADD COLUMN summoned_roles_json TEXT NOT NULL DEFAULT '[]';");
  }
}

function ensureMailAttachmentColumns(db: DatabaseSync) {
  const columns = db
    .prepare("PRAGMA table_info(mail_attachments);")
    .all() as Array<{ name: string }>;
  const names = new Set(columns.map((column) => column.name));

  if (!names.has("content_sha256")) {
    db.exec("ALTER TABLE mail_attachments ADD COLUMN content_sha256 TEXT;");
  }

  if (!names.has("artifact_path")) {
    db.exec("ALTER TABLE mail_attachments ADD COLUMN artifact_path TEXT;");
  }
}

function ensureInboxItemColumns(db: DatabaseSync) {
  const columns = db
    .prepare("PRAGMA table_info(inbox_items);")
    .all() as Array<{ name: string }>;
  const names = new Set(columns.map((column) => column.name));

  if (!names.has("participant_role")) {
    db.exec("ALTER TABLE inbox_items ADD COLUMN participant_role TEXT NOT NULL DEFAULT 'front';");
  }
}
