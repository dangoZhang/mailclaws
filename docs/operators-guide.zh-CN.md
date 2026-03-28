# 运维指南

<p align="center">
  <a href="./operators-guide.md">English</a> ·
  <a href="./operators-guide.zh-CN.md"><strong>简体中文</strong></a> ·
  <a href="./operators-guide.fr.md">Français</a>
</p>

本指南覆盖当前已经落地的运维流程，包括 `/console` 运维观察面以及 runtime 与 CLI/API 操作；它不是完整邮箱客户端使用手册。

## 范围与术语

MailClaw 运维观察面围绕以下对象：

- `room`：耐久协作边界
- `virtual mail`：内外消息统一投影模型
- `mailbox`：room 消息的投影视图
- `projection`：provider/Gateway/internal 来源映射到 room 真相层
- `approval` 与 `delivery`：外发副作用治理
- `provider state`：账号级 cursor/watch/checkpoint 健康状态

## 一线值守排查路径（邮箱用户视角）

当用户反馈“我发了邮件，系统到底收没收”时，按以下顺序排查：

1. 账号与 provider 健康：
   - `pnpm mailctl observe accounts show <accountId>`
   - `GET /api/accounts/:accountId/provider-state`
2. room 是否创建：
   - `pnpm mailctl observe rooms`
   - `pnpm mailctl observe room <roomKey>`
3. inbox 投影是否可见：
   - `pnpm mailctl observe inboxes <accountId>`
   - `pnpm mailctl observe mailbox-feed <accountId> <mailboxId>`
4. internal agent 协作邮件是否存在：
   - `pnpm mailctl observe mailbox-view <roomKey> <mailboxId> virtual_internal`
5. 外发治理状态：
   - `pnpm mailctl observe approvals room <roomKey>`
   - `pnpm mailctl operate deliver-outbox`

控制台对应路径：

- `/console/accounts/:accountId`
- `/console/rooms/:roomKey`
- `/console/mailboxes/:accountId/:mailboxId`

## 每日值守检查

服务基础检查：

```bash
curl -s http://127.0.0.1:3000/healthz
curl -s http://127.0.0.1:3000/readyz
```

运行时盘点：

```bash
pnpm mailctl observe accounts
pnpm mailctl observe rooms
pnpm mailctl operate quarantine
pnpm mailctl operate dead-letter
```

控制台级 API 快照：

- `GET /api/console/terminology`
- `GET /api/console/accounts`
- `GET /api/console/rooms`
- `GET /api/console/approvals`
- `GET /api/runtime/execution`
- `GET /api/runtime/embedded-sessions`

浏览器控制台：

- `GET /console`
- 稳定深链包括 `/console/accounts/:accountId`、`/console/inboxes/:accountId/:inboxId`、`/console/rooms/:roomKey`、`/console/mailboxes/:accountId/:mailboxId`

runtime / operator 观测：

```bash
pnpm mailctl observe runtime
pnpm mailctl observe embedded-sessions [sessionKey]
```

## 账号、Provider 与入站操作

接入或更新账号：

```bash
pnpm mailctl connect providers [provider]
pnpm mailctl connect login
pnpm mailctl connect login gmail <accountId> [displayName]
pnpm mailctl connect login outlook <accountId> [displayName]
```

查看账号/provider 状态：

```bash
pnpm mailctl observe accounts show <accountId>
curl -s http://127.0.0.1:3000/api/accounts/<accountId>/provider-state
curl -s http://127.0.0.1:3000/api/connect
curl -s http://127.0.0.1:3000/api/connect/providers
```

入站路径：

- 规范化 JSON：`POST /api/inbound?processImmediately=true`
- 原始 MIME：`POST /api/inbound/raw?processImmediately=true`
- Gmail Pub/Sub 与恢复：`POST /api/accounts/:accountId/gmail/notifications`、`POST /api/accounts/:accountId/gmail/recover`

## Room、时间线、Mailbox 与投影检查

核心 room 检查：

```bash
pnpm mailctl observe room <roomKey>
pnpm mailctl observe approvals room <roomKey>
pnpm mailctl observe mailbox-view <roomKey> <mailboxId>
```

跨 room mailbox 与 inbox 观察面：

```bash
pnpm mailctl observe inboxes <accountId>
pnpm mailctl inboxes project <accountId> <agentId>
pnpm mailctl inboxes console <accountId>
pnpm mailctl observe mailbox-feed <accountId> <mailboxId>
```

Gateway 投影链路检查：

```bash
pnpm mailctl observe projection <roomKey>
pnpm mailctl gateway resolve <sessionKey> [roomKey]
```

对应 API：

- `GET /api/rooms/:roomKey/replay`
- `GET /api/rooms/:roomKey/approvals`
- `GET /api/rooms/:roomKey/mailboxes/:mailboxId`
- `GET /api/rooms/:roomKey/gateway-projection-trace`
- `GET /api/accounts/:accountId/inboxes`
- `GET /api/accounts/:accountId/mailbox-console`
- `GET /api/accounts/:accountId/mailboxes/:mailboxId/feed`

## 审批、Outbox、恢复与队列控制

审批/outbox 操作：

```bash
pnpm mailctl operate approve <outboxId>
pnpm mailctl operate reject <outboxId>
pnpm mailctl operate resend <outboxId>
pnpm mailctl operate deliver-outbox
```

恢复与队列操作：

```bash
pnpm mailctl operate recover [timestamp]
pnpm mailctl operate drain [limit]
pnpm mailctl operate dead-letter retry <jobId>
```

HTTP 对应接口：

- `POST /api/outbox/:outboxId/approve`
- `POST /api/outbox/:outboxId/reject`
- `POST /api/outbox/deliver`
- `POST /api/recovery/room-queue`
- `POST /api/dead-letter/room-jobs/:jobId/retry`

## 常见排障捷径

- 外发卡在待审批：先看 `mailctl approvals trace <roomKey>`，再执行 `approve` 或 `reject`。
- room 状态不清楚：联查 `mailctl replay <roomKey>` 与 mailbox view/feed。
- provider 同步异常：检查 provider state 与 watcher/recovery 入口。
- Gateway 链路不清楚：把 `gateway trace` 与 room replay 对照查看。

## 当前运维缺口

- 已有 `/console` 只读 operator UI 控制台，但它还不是可写的完整邮箱客户端。
- CLI 输出仍以 JSON 为主，命令树易用性还在收敛中。
- Gateway 投影 API 已可用，但尚未与上游 Workbench 事件流形成完整自动闭环。
- upstream embedded runtime/session-manager 一等接线与 backend enforcement 完整收口仍属于 residual 工作（`plan12`）。
