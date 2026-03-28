import type { DatabaseSync } from "node:sqlite";

import type { TaskNode } from "../../core/types.js";

export function saveTaskNode(db: DatabaseSync, taskNode: TaskNode) {
  db.prepare(
    `
      INSERT INTO task_nodes (
        node_id,
        room_key,
        revision,
        role,
        depends_on_json,
        input_refs_json,
        deadline_ms,
        priority,
        status,
        task_class,
        mail_task_kind,
        mail_task_stage,
        title,
        summary_text,
        next_action
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(node_id) DO UPDATE SET
        room_key = excluded.room_key,
        revision = excluded.revision,
        role = excluded.role,
        depends_on_json = excluded.depends_on_json,
        input_refs_json = excluded.input_refs_json,
        deadline_ms = excluded.deadline_ms,
        priority = excluded.priority,
        status = excluded.status,
        task_class = excluded.task_class,
        mail_task_kind = excluded.mail_task_kind,
        mail_task_stage = excluded.mail_task_stage,
        title = excluded.title,
        summary_text = excluded.summary_text,
        next_action = excluded.next_action;
    `
  ).run(
    taskNode.nodeId,
    taskNode.roomKey,
    taskNode.revision,
    taskNode.role,
    JSON.stringify(taskNode.dependsOn),
    JSON.stringify(taskNode.inputRefs),
    taskNode.deadlineMs ?? null,
    taskNode.priority,
    taskNode.status,
    taskNode.taskClass,
    taskNode.mailTaskKind ?? null,
    taskNode.mailTaskStage ?? null,
    taskNode.title ?? null,
    taskNode.summary ?? null,
    taskNode.nextAction ?? null
  );
}

export function listTaskNodesForRoom(db: DatabaseSync, roomKey: string): TaskNode[] {
  const rows = db
    .prepare(
      `
        SELECT
          node_id,
          room_key,
          revision,
          role,
          depends_on_json,
          input_refs_json,
          deadline_ms,
          priority,
          status,
          task_class,
          mail_task_kind,
          mail_task_stage,
          title,
          summary_text,
          next_action
        FROM task_nodes
        WHERE room_key = ?
        ORDER BY revision DESC, priority DESC, node_id ASC;
      `
    )
    .all(roomKey) as Array<{
    node_id: string;
    room_key: string;
    revision: number;
    role: TaskNode["role"];
    depends_on_json: string;
    input_refs_json: string;
    deadline_ms: number | null;
    priority: number;
    status: TaskNode["status"];
    task_class: TaskNode["taskClass"];
    mail_task_kind: TaskNode["mailTaskKind"] | null;
    mail_task_stage: TaskNode["mailTaskStage"] | null;
    title: string | null;
    summary_text: string | null;
    next_action: string | null;
  }>;

  return rows.map((row) => ({
    nodeId: row.node_id,
    roomKey: row.room_key,
    revision: row.revision,
    role: row.role,
    dependsOn: JSON.parse(row.depends_on_json) as string[],
    inputRefs: JSON.parse(row.input_refs_json) as string[],
    deadlineMs: row.deadline_ms ?? undefined,
    priority: row.priority,
    status: row.status,
    taskClass: row.task_class,
    ...(row.mail_task_kind ? { mailTaskKind: row.mail_task_kind } : {}),
    ...(row.mail_task_stage ? { mailTaskStage: row.mail_task_stage } : {}),
    ...(row.title ? { title: row.title } : {}),
    ...(row.summary_text ? { summary: row.summary_text } : {}),
    ...(row.next_action ? { nextAction: row.next_action } : {})
  }));
}

export function getTaskNode(db: DatabaseSync, nodeId: string): TaskNode | null {
  const row = db
    .prepare(
      `
        SELECT
          node_id,
          room_key,
          revision,
          role,
          depends_on_json,
          input_refs_json,
          deadline_ms,
          priority,
          status,
          task_class,
          mail_task_kind,
          mail_task_stage,
          title,
          summary_text,
          next_action
        FROM task_nodes
        WHERE node_id = ?
        LIMIT 1;
      `
    )
    .get(nodeId) as
    | {
        node_id: string;
        room_key: string;
        revision: number;
        role: TaskNode["role"];
        depends_on_json: string;
        input_refs_json: string;
        deadline_ms: number | null;
        priority: number;
        status: TaskNode["status"];
        task_class: TaskNode["taskClass"];
        mail_task_kind: TaskNode["mailTaskKind"] | null;
        mail_task_stage: TaskNode["mailTaskStage"] | null;
        title: string | null;
        summary_text: string | null;
        next_action: string | null;
      }
    | undefined;

  if (!row) {
    return null;
  }

  return {
    nodeId: row.node_id,
    roomKey: row.room_key,
    revision: row.revision,
    role: row.role,
    dependsOn: JSON.parse(row.depends_on_json) as string[],
    inputRefs: JSON.parse(row.input_refs_json) as string[],
    deadlineMs: row.deadline_ms ?? undefined,
    priority: row.priority,
    status: row.status,
    taskClass: row.task_class,
    ...(row.mail_task_kind ? { mailTaskKind: row.mail_task_kind } : {}),
    ...(row.mail_task_stage ? { mailTaskStage: row.mail_task_stage } : {}),
    ...(row.title ? { title: row.title } : {}),
    ...(row.summary_text ? { summary: row.summary_text } : {}),
    ...(row.next_action ? { nextAction: row.next_action } : {})
  };
}
