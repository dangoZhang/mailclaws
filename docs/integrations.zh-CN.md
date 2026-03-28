# 集成指南

<p align="center">
  <a href="./integrations.md">English</a> ·
  <a href="./integrations.zh-CN.md"><strong>简体中文</strong></a> ·
  <a href="./integrations.fr.md">Français</a>
</p>

本指南说明当前已经支持的集成路径，以及明确的边界。

## 兼容定位

MailClaw 与 OpenClaw 生态兼容，并保留 Gateway 入口兼容性。当前分工如下：

- OpenClaw 继续提供 Gateway/runtime/agent packaging 等上游基座。
- MailClaw 负责 room 真相层、virtual mail 协作语义、approval/outbox 治理，以及 replay/recovery 投影视图。

## 普通邮箱用户接入策略

建议按以下优先级接入：

1. Gmail/Outlook OAuth（`mailctl connect login gmail|outlook`），接入成本最低。
2. 无 OAuth 时走密码/IMAP 预设（`mailctl connect login imap|qq|icloud|yahoo|163|126`）。
3. provider 原生接入暂不可行时，用转发/raw MIME 回退（`provider: "forward"` + `POST /api/inbound/raw`）。

这套顺序与当前 `plan12` 收口方向一致，也便于后续迁移到面向普通用户的引导式接入（`plan13`）。

如果你只知道邮箱地址，还不知道该走哪条接入路径，先用：

- `pnpm mailctl connect start you@example.com`
- `GET /api/connect/onboarding?emailAddress=you@example.com`

如果你已经在跑 OpenClaw，建议先保留 bridge 模式，把 MailClaw 当作 room/approval/replay 层接上来：

- `MAILCLAW_FEATURE_OPENCLAW_BRIDGE=true MAILCLAW_FEATURE_MAIL_INGEST=true pnpm dev`
- `pnpm mailctl observe runtime`
- `pnpm mailctl observe workbench <accountId>`

## 入站集成路径

Provider 驱动入站：

- 内建 IMAP 抓取与 watcher 控制器
- Gmail watch/history recovery 入站

API 驱动入站：

- 规范化消息：`POST /api/inbound`
- 原始 RFC822/MIME：`POST /api/inbound/raw`

Gateway 驱动入站：

- 单一事件 / 批处理入口：`POST /api/gateway/events`
- 会话到 room 的 resolve/bind：`GET /api/gateway/sessions/:sessionKey`、`POST /api/gateway/sessions/:sessionKey/bind`
- Gateway turn 投影为 virtual mail：`POST /api/gateway/project`
- 已绑定 Gateway 的 room 现在会对符合条件的 `final_ready / progress / handoff / approval / system_notice` 消息自动记录 `gateway.outcome.projected`

边界说明：room outcome 的 Gateway 回投留痕现在已自动化，但本仓库里尚未完成完整上游 Gateway 事件流的自动接线。

## 外发集成路径

MailClaw 的外发路径以治理为先：

- 对 outbox 待处理项执行批准/拒绝：`POST /api/outbox/:outboxId/approve|reject`
- 投递待发送外邮：`POST /api/outbox/deliver`
- 重发路径可通过 CLI 使用（`mailctl resend <outboxId>`）

Provider 外发后端：

- Gmail OAuth 账户走 Gmail API 外发
- SMTP 外发（支持进程级与 account 级配置）

Gateway 结果回投：

- `POST /api/gateway/outcome` 可把 room outcome 投影给外部 Gateway 侧消费。
- outcome 分类已实现，但上游通知/投递适配器仍是部分落地状态。

## OAuth、账号与 Provider 配置

Gmail OAuth 变量：

- `MAILCLAW_GMAIL_OAUTH_CLIENT_ID`
- `MAILCLAW_GMAIL_OAUTH_TOPIC_NAME`（登录后立刻可 watch/recovery）
- 可选：`MAILCLAW_GMAIL_OAUTH_CLIENT_SECRET`、`MAILCLAW_GMAIL_OAUTH_USER_ID`、`MAILCLAW_GMAIL_OAUTH_LABEL_IDS`、`MAILCLAW_GMAIL_OAUTH_SCOPES`

Outlook/Microsoft OAuth 变量：

- `MAILCLAW_MICROSOFT_OAUTH_CLIENT_ID`
- 可选：`MAILCLAW_MICROSOFT_OAUTH_CLIENT_SECRET`、`MAILCLAW_MICROSOFT_OAUTH_TENANT`、`MAILCLAW_MICROSOFT_OAUTH_SCOPES`

CLI 配置命令：

```bash
pnpm mailctl connect providers [provider]
pnpm mailctl connect login
pnpm mailctl connect login gmail <accountId> [displayName]
pnpm mailctl connect login outlook <accountId> [displayName]
```

API 配置入口：

- `GET /api/connect`
- `GET /api/connect/providers`
- `GET /api/connect/providers/:provider`
- `POST /api/accounts`
- 浏览器重定向入口：`GET /api/auth/:provider/start`
- 带 secret 或程序化启动：`POST /api/auth/:provider/start`

发布说明：

- `GET /api/auth/:provider/start` 会拒绝 query 里的 `clientSecret`；请改用 POST 或 env 驱动的 CLI 流程。

如果是 forward/export 入站场景，使用 `provider: "forward"`，并配置 account 级 `settings.smtp` 用于外发。

## 观察与投影视图

账号与 provider 状态：

- `GET /api/accounts`
- `GET /api/accounts/:accountId/provider-state`

Room、mailbox、approval 投影视图：

- `GET /api/rooms/:roomKey/replay`
- `GET /api/rooms/:roomKey/approvals`
- `GET /api/rooms/:roomKey/mailboxes/:mailboxId`
- `GET /api/accounts/:accountId/inboxes`
- `GET /api/accounts/:accountId/mailbox-console`
- `GET /api/accounts/:accountId/mailboxes/:mailboxId/feed`

Gateway 投影追踪：

- `GET /api/rooms/:roomKey/gateway-projection-trace`

## 当前集成缺口

- 已有 `/console` 只读 operator UI，但它还不是完整邮箱客户端。
- 还没有 OpenClaw Workbench mailbox tab 集成。
- Gateway 自动入站/回投的生产级接线尚未完成。
- Provider 覆盖已比早期更广，但还没有达到长期目标的完整集合。
- upstream embedded runtime/session-manager 一等接线与 backend policy enforcement 完整收口仍未完成（`plan12`）。
