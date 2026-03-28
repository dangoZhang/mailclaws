# MailClaw

<p align="center">
  面向耐久化、可审计、多智能体协作的邮件原生运行时。
</p>

<p align="center">
  <a href="./README.md">English</a> ·
  <a href="./README.zh-CN.md"><strong>简体中文</strong></a> ·
  <a href="./README.fr.md">Français</a>
</p>

MailClaw 把邮件线程变成具备显式状态、可回放记录、审批链路、局部检索和受治理外发能力的持久化房间。它起步于 [OpenClaw](https://github.com/openclaw/openclaw)，但目标是邮件原生运行时，而不是薄薄的传输插件。

## MailClaw 是什么

当前阶段，MailClaw 的定位是“后端 runtime + 运维观察面”。核心目标是线程级连续性、基于虚拟邮件的内部协作、可回放运维链路，以及审批闸门下的真实外发治理。

## 与 OpenClaw 的关系

MailClaw 复用 OpenClaw 生态入口（Gateway、runtime substrate、agent packaging），并保持 Gateway 兼容。MailClaw 负责定义 room 真相层、虚拟邮件协作语义、approval/outbox 治理，以及 replay/recovery 的运维模型。

## 今天已经可用

- 基于 SQLite 的线程优先 room kernel
- 基于回复头与 provider 线程线索的确定性 room/session 身份
- 回放、恢复、隔离区、死信、重发、批准、拒绝等耐久治理流程
- 面向内部 orchestrator/worker 协作的 virtual mail 平面与耐久 projection 状态
- 内建 IMAP 抓取、IMAP/Gmail watcher 控制、Gmail history recovery/watch 接入、SMTP/Gmail 外发
- account 级 SMTP 外发配置（适用于非 Gmail 账户）
- `POST /api/inbound/raw` 的 forward/raw RFC822 入站能力
- 通过 `mailctl` 与 `/api/auth/:provider/*` 提供 Gmail/Outlook OAuth 邮箱登录
- 通过 `mailctl connect providers` 与 `GET /api/connect/providers` 提供 provider/setup 目录，覆盖 Gmail、Outlook、QQ、iCloud、Yahoo、163/126、通用 IMAP，以及 forward/raw MIME 回退路径
- Gateway 绑定的 room 现在会对 `final_ready` 一类结果自动留下 outcome projection 记录，并可在 replay/API/console 中查看
- 覆盖 room、approval、provider state、inbox projection、mailbox console/feed、gateway projection trace 的 HTTP/CLI 观察面
- `/console` 只读运维控制台，可统一查看 accounts、rooms、approvals、mailboxes 与 gateway trace

## 3 分钟首封邮件路径

如果你习惯普通邮箱客户端，可以把 MailClaw 当成“登录账号 -> 发一封邮件 -> 看会话”：

1. 启动 runtime：`pnpm dev`
2. 先让 MailClaw 推荐最省事的接入路径：`pnpm mailctl connect start you@example.com`
3. 登录邮箱账号：`pnpm mailctl connect login`
4. 查看账号与地址信息：`pnpm mailctl connect accounts show <accountId>`
5. 用另一个邮箱（或你自己的第二个地址）给该邮箱发一封测试邮件
6. 查看 room 与 inbox：
   - `pnpm mailctl observe rooms`
   - `pnpm mailctl observe inboxes <accountId>`
   - 打开 `http://127.0.0.1:3000/console/connect` 获取 mailbox-first 引导，再进入 `http://127.0.0.1:3000/console/accounts/<accountId>` 查看已连接账号工作台

同样的推荐流程也暴露在 `GET /api/connect/onboarding?emailAddress=you@example.com`。

如果你已经在用 OpenClaw，建议先从 bridge 模式进入，再观察 MailClaw 的 room truth，而不是继续把 session transcript 当真相：

- `MAILCLAW_FEATURE_OPENCLAW_BRIDGE=true MAILCLAW_FEATURE_MAIL_INGEST=true pnpm dev`
- `pnpm mailctl observe runtime`
- `pnpm mailctl observe workbench <accountId>`

查看某个 room 的内部智能体协作邮件：

- `pnpm mailctl observe mailbox-view <roomKey> <mailboxId> virtual_internal`
- `pnpm mailctl observe mailbox-feed <accountId> <mailboxId> 50 virtual_internal`

## 当前边界

- 已有 `/console` 只读运维控制台，但还不是完整的 Outlook 风格邮箱客户端。
- 还没有 OpenClaw Workbench mailbox tab 集成。
- Gateway outcome trace 现已可在 room 绑定 Gateway 后自动留下，但完整的上游 Gateway ingress / Workbench 自动接线仍未完成。
- 连接引导已提供 CLI/API 目录，但 MailClaw 仍不会替你自动配置 provider 侧的 DNS、Pub/Sub topic、转发规则或邮箱策略。
- OpenClaw embedded runtime/session-manager 的一等接入与完整 backend enforcement 收口仍在 residual closeout（`plan12`）里。

## 文档入口

- [文档索引（中文）](./docs/index.zh-CN.md)
- [快速开始（中文）](./docs/getting-started.zh-CN.md)
- [运维控制台（中文）](./docs/operator-console.zh-CN.md)
- [运维指南（中文）](./docs/operators-guide.zh-CN.md)
- [集成指南（中文）](./docs/integrations.zh-CN.md)
- [发布素材（中文）](./docs/release-assets.zh-CN.md)

英文和法文文档可通过每页顶部语言链接切换。

本地启动文档网站：

```bash
pnpm docs:dev
```

构建静态文档站：

```bash
pnpm docs:build
```

## 快速启动

安装依赖：

```bash
pnpm install
```

用 OpenClaw bridge 模式启动：

```bash
MAILCLAW_RUNTIME_POLICY_MANIFEST_JSON='{"toolPolicies":["mail-orchestrator","mail-attachment-reader","mail-researcher","mail-drafter","mail-reviewer","mail-guard"],"sandboxPolicies":["mail-room-orchestrator","mail-room-worker"],"networkAccess":"allowlisted","filesystemAccess":"workspace-read","outboundMode":"approval_required"}' \
MAILCLAW_FEATURE_MAIL_INGEST=true \
MAILCLAW_FEATURE_OPENCLAW_BRIDGE=true \
MAILCLAW_OPENCLAW_GATEWAY_TOKEN=dev-token \
pnpm dev
```

然后进入[快速开始文档](./docs/getting-started.zh-CN.md)，完成账号接入和最小闭环演示。

推荐的邮箱接入顺序：

```bash
pnpm mailctl connect providers
pnpm mailctl connect login
pnpm mailctl observe accounts
```

无浏览器环境下的 OAuth 登录：

```bash
pnpm mailctl connect login oauth gmail <accountId> [displayName] --no-browser
pnpm mailctl connect login oauth outlook <accountId> [displayName] --no-browser
```

## 发布验收

发版前建议至少执行：

```bash
pnpm build
pnpm test:workflow
pnpm test:security
pnpm docs:build
```

可选的真实 provider smoke：

```bash
pnpm test:live-providers
```

## 许可

MailClaw 使用 [MIT 许可](./LICENSE)，与 [OpenClaw](https://github.com/openclaw/openclaw) 保持一致。
