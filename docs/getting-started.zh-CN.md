# 快速开始

<p align="center">
  <a href="./getting-started.md">English</a> ·
  <a href="./getting-started.zh-CN.md"><strong>简体中文</strong></a> ·
  <a href="./getting-started.fr.md">Français</a>
</p>

本指南面向当前 MailClaw 的开发者/运维运行时形态，包含 `/console` 只读运维观察面，但不依赖完整邮箱 UI。

## 前置条件

- Node.js 与 `pnpm`
- 本仓库代码
- 可选：真实邮箱凭据（用于 live provider 测试）

安装依赖：

```bash
pnpm install
```

## 1. 启动运行时

Bridge 模式（兼容 OpenClaw）：

```bash
MAILCLAW_RUNTIME_POLICY_MANIFEST_JSON='{"toolPolicies":["mail-orchestrator","mail-attachment-reader","mail-researcher","mail-drafter","mail-reviewer","mail-guard"],"sandboxPolicies":["mail-room-orchestrator","mail-room-worker"],"networkAccess":"allowlisted","filesystemAccess":"workspace-read","outboundMode":"approval_required"}' \
MAILCLAW_FEATURE_MAIL_INGEST=true \
MAILCLAW_FEATURE_OPENCLAW_BRIDGE=true \
MAILCLAW_OPENCLAW_GATEWAY_TOKEN=dev-token \
pnpm dev
```

Command 模式（本地 runtime 命令）：

```bash
MAILCLAW_RUNTIME_POLICY_MANIFEST_JSON='{"toolPolicies":["mail-orchestrator","mail-attachment-reader","mail-researcher","mail-drafter","mail-reviewer","mail-guard"],"sandboxPolicies":["mail-room-orchestrator","mail-room-worker"],"networkAccess":"allowlisted","filesystemAccess":"workspace-read","outboundMode":"approval_required"}' \
MAILCLAW_RUNTIME_MODE=command \
MAILCLAW_RUNTIME_COMMAND='mail-runtime --stdio' \
MAILCLAW_FEATURE_MAIL_INGEST=true \
pnpm dev
```

只要 runtime turn 含有 `executionPolicy` 元数据，就必须提供 `MAILCLAW_RUNTIME_POLICY_MANIFEST_JSON`。

启动后可以直接打开只读运维控制台：

```text
http://127.0.0.1:3000/console
```

## 2. 接入账号

可选路径：

- 先查看 provider/setup 目录：`pnpm mailctl connect providers [provider]`
- 先让系统按邮箱地址推荐路径：`pnpm mailctl connect start you@example.com`
- 终端交互向导：`pnpm mailctl connect login`
- Gmail OAuth：`pnpm mailctl connect login gmail <accountId> [displayName]`
- Outlook OAuth：`pnpm mailctl connect login outlook <accountId> [displayName]`
- 无浏览器 Gmail OAuth：`pnpm mailctl connect login oauth gmail <accountId> [displayName] --no-browser`
- 无浏览器 Outlook OAuth：`pnpm mailctl connect login oauth outlook <accountId> [displayName] --no-browser`
- API 注册账号：`POST /api/accounts`

推荐 bootstrap 顺序：

```bash
pnpm mailctl connect providers
pnpm mailctl connect login
pnpm mailctl observe accounts
```

查看已接入账号：

```bash
pnpm mailctl observe accounts
```

Provider setup 目录 API：

```bash
curl -s http://127.0.0.1:3000/api/connect
curl -s "http://127.0.0.1:3000/api/connect/onboarding?emailAddress=you@example.com"
curl -s http://127.0.0.1:3000/api/connect/providers
curl -s http://127.0.0.1:3000/api/connect/providers/gmail
```

<a id="three-minute-first-mail"></a>

## 3. 先跑通第一封真实邮件（普通邮箱用户路径） {#three-minute-first-mail}

账号登录后，先按日常邮件习惯走一遍：

1. 从这里查看已连接邮箱地址：
   - `pnpm mailctl connect accounts show <accountId>`
2. 用另一个邮箱客户端/账号给该地址发送一封邮件。
3. 查看新建 room 与 inbox：
   - `pnpm mailctl observe rooms`
   - `pnpm mailctl observe inboxes <accountId>`
   - `pnpm mailctl observe room <roomKey>`
4. 打开控制台页面：
   - `http://127.0.0.1:3000/console/accounts/<accountId>`
   - `http://127.0.0.1:3000/console/rooms/<roomKey>`
5. 查看内部智能体协作邮件：
   - `pnpm mailctl mailbox view <roomKey> <mailboxId>`
   - `pnpm mailctl mailbox feed <accountId> <mailboxId>`

这是当前最短的“登录 -> 收信 -> 观察 -> 治理”闭环。

## 4. 路径 A：provider mail -> room -> approval -> delivery

注入规范化入站邮件：

```bash
curl -X POST 'http://127.0.0.1:3000/api/inbound?processImmediately=true' \
  -H 'content-type: application/json' \
  -d '{
    "accountId": "acct-1",
    "mailboxAddress": "mailclaw@example.com",
    "envelope": {
      "providerMessageId": "provider-1",
      "messageId": "<msg-1@example.com>",
      "subject": "API room",
      "from": { "email": "sender@example.com" },
      "to": [{ "email": "mailclaw@example.com" }],
      "text": "Hello from the API",
      "headers": [{ "name": "Message-ID", "value": "<msg-1@example.com>" }]
    }
  }'
```

查看 room 与审批状态：

```bash
pnpm mailctl observe rooms
pnpm mailctl observe room <roomKey>
pnpm mailctl observe approvals room <roomKey>
```

投递待发送 outbox：

```bash
pnpm mailctl operate deliver-outbox
```

## 5. 路径 B：Gateway turn -> virtual mail -> room -> final outcome

把 Gateway turn 投影进 MailClaw：

```bash
curl -X POST 'http://127.0.0.1:3000/api/gateway/project' \
  -H 'content-type: application/json' \
  -d '{
    "sessionKey": "gw-session-1",
    "sourceControlPlane": "openclaw",
    "fromPrincipalId": "agent:front",
    "fromMailboxId": "front-mailbox",
    "toMailboxIds": ["mail-orchestrator"],
    "kind": "claim",
    "visibility": "internal",
    "subject": "Gateway projection smoke",
    "bodyRef": "gateway message body",
    "inputsHash": "smoke-hash-1"
  }'
```

查看投影链路和 room 时间线：

```bash
pnpm mailctl gateway trace <roomKey>
pnpm mailctl replay <roomKey>
```

边界说明：Gateway projection API 已实现，但本仓库尚未把完整上游 Gateway 事件流自动接通。

## 6. 路径 C：internal multi-agent -> reducer/reviewer/guard -> projected outcome

本地开启 worker/governance 相关开关：

```bash
MAILCLAW_FEATURE_SWARM_WORKERS=true \
MAILCLAW_FEATURE_APPROVAL_GATE=true \
MAILCLAW_FEATURE_IDENTITY_TRUST_GATE=true \
pnpm dev
```

然后通过 room mailbox/feed 观察内部协作工件：

```bash
pnpm mailctl mailbox view <roomKey> <mailboxId>
pnpm mailctl mailbox feed <accountId> <mailboxId>
pnpm mailctl approvals trace <roomKey>
```

可通过 origin 过滤（`provider_mail`、`gateway_chat`、`virtual_internal`）检查内部多智能体状态流转。

## 7. 下一步

- 运维与排障流程：[运维指南](./operators-guide.zh-CN.md)
- Provider/Gateway/OpenClaw 接入方式：[集成指南](./integrations.zh-CN.md)
- 真实凭据 smoke 流程：[Live Provider Smoke](./live-provider-smoke.md)

发布验收基线：

```bash
pnpm build
pnpm test:workflow
pnpm test:security
pnpm docs:build
```
