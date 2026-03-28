---
layout: home

hero:
  name: MailClaw
  text: 3 分钟连上邮箱并完成第一封测试邮件
  tagline: MailClaw 用 Room 持久化邮件上下文，用 Virtual Mail 组织多智能体协作，并在控制台集中观察全链路状态。
  actions:
    - theme: brand
      text: 3 分钟首封邮件
      link: /zh-CN/getting-started#three-minute-first-mail
    - theme: alt
      text: 打开运维控制台
      link: /zh-CN/operator-console
    - theme: alt
      text: 登录方式
      link: /zh-CN/integrations

features:
  - title: 邮件上下文可持久
    details: 每封入站邮件都会进入 Room，带 revision、审批状态、投递轨迹和可重放事件。
  - title: 内部 Agent 邮箱可观察
    details: 内部协作通过虚拟 mailbox thread 进行，不污染外部线程，且可按 mailbox 回看过程。
  - title: 默认安全外发
    details: 真实发送只允许走 outbox + approval，worker 不能绕过治理链路。
  - title: 一个控制台看全链路
    details: "`/console` 和 `mailctl` 可以一起查看 rooms、mailboxes、approvals 与 gateway traces。"
---

## 先走这 3 分钟

1. 启动运行时：`pnpm dev`
2. 登录邮箱：`pnpm mailctl connect login`
3. 校验账号并打开控制台：
   - `pnpm mailctl observe accounts`
   - `http://127.0.0.1:3000/console`
   - `http://127.0.0.1:3000/console/connect`

继续执行首封邮件路径：[快速开始](./getting-started.zh-CN.md#three-minute-first-mail)。

## 在哪里看内部 Agent 协作

- `/console/accounts/:accountId`：从账号页进入 room 或 mailbox 详情。
- `/console/connect`：从邮箱地址出发拿推荐 provider 路径。
- `/console/mailboxes/:accountId/:mailboxId`：按 mailbox 观察单个 agent 的收件流。
- `/console/rooms/:roomKey`：把外部邮件状态与内部协作轨迹放在一个页面看。
- CLI 对应命令：
  - `pnpm mailctl observe mailbox-feed <accountId> <mailboxId>`
  - `pnpm mailctl observe mailbox-view <roomKey> <mailboxId>`

## 文档入口

- [快速开始](./getting-started.zh-CN.md)：3 分钟上手 + provider/gateway/internal-agent 路径。
- [运维控制台](./operator-console.zh-CN.md)：`/console` 路由、筛选和 mailbox 观察模型。
- [运维指南](./operators-guide.zh-CN.md)：日常运维、审批、恢复、排障。
- [集成指南](./integrations.zh-CN.md)：provider 覆盖、OAuth、入站/出站接线与 OpenClaw 兼容关系。
- [安全边界](./security-boundaries.zh-CN.md)：信任模型、脱敏范围与当前未隔离能力。

## 发布事实

- 已交付：runtime kernel、provider 入站/出站接缝、gateway projection API、replay/approval 流程，以及只读 `/console` 运维面。
- 未交付：完整 Outlook 风格邮箱客户端、Workbench mailbox tab 集成、自动化 Gateway 全链路 round-trip。
- 发版前建议：执行 [真实 Provider Smoke](./live-provider-smoke.zh-CN.md)，并对照 [ADR-001 架构决策](./adr/ADR-001-architecture.md) 检查约束。

## 当前边界

- 这个仓库现在已经能通过 `pnpm docs:dev` 和 `pnpm docs:build` 产出可浏览的文档网站。
- 当前仍是 runtime + 只读运维控制台，不是完整的 Outlook 风格邮箱客户端，也还没有 OpenClaw Workbench mailbox tab 集成。
