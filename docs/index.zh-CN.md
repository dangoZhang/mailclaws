---
layout: home

hero:
  name: MailClaw
  text: 让邮件工作真正有形状
  tagline: MailClaw 把外部邮件变成 durable room，把内部多智能体协作变成虚拟邮件，并把长期记忆收敛成 Pre，而不是越滚越长的 transcript。
  actions:
    - theme: brand
      text: 3 分钟开始
      link: /zh-CN/getting-started#three-minute-first-mail
    - theme: alt
      text: 核心概念
      link: /zh-CN/concepts
    - theme: alt
      text: Mail Workbench
      link: /zh-CN/operator-console

features:
  - title: Room 是真相边界
    details: 每个真实邮件会话都会落到一个 room 里，带 revision、timeline、审批和投递状态。
  - title: 内部协作也是邮件
    details: Agent 不共享一锅上下文，而是通过 virtual mailboxes、work threads 和 reducer 协作。
  - title: Pre 优先，记忆更干净
    details: MailClaw 长期保留的是 summary、facts、decisions、commitments 这类 Pre，而不是原始推理轨迹。
  - title: 外发默认受治理
    details: 真正的外发必须经过 draft、review、approval 和 outbox intent，worker 不能直接越权发送。
  - title: 一个 Mail 标签看全链路
    details: Accounts、Rooms、Mailboxes、Approvals 都在同一个 OpenClaw 风格 Mail 标签里可见。
---

## 为什么是 MailClaw

很多 agent 系统只是把邮件当 transport。MailClaw 不是。

MailClaw 直接把邮件工作本身建模成运行时：

- 外部邮件进入 room
- 内部协作进入 virtual mail
- 长期记忆保留为 Pre
- 外发副作用进入 approval 和 outbox

所以它既适合真实邮件用户，也适合需要追踪多智能体协作过程的团队。

## 核心工作流

1. 连接一个你已经在用的邮箱
2. 新邮件进入后创建或续接 room
3. agents 在内部 mailbox/work thread 里协作
4. 结果被压缩成 durable Pre
5. 你从 Mail 标签里查看账户、room、mailbox 和审批

## 四个核心特性

### Room

Room 是外部邮件会话的 durable truth boundary。

- continuity 由 reply 结构和 provider hint 决定
- room 承载 revision、参与者、附件证据、审批和 replay
- 新回复到达时，旧的 stale work 会失效而不是静默混入

### Virtual Mail

内部多智能体协作通过虚拟邮件完成。

- 每个 agent 可以有 public/internal mailbox
- internal reply 是 single-parent
- fan-in 交给 reducer 收敛
- 外部线程保持干净，内部协作仍可回看

### Pre

MailClaw 用 pre-first memory，而不是 transcript-first。

- 临时推理发生在 scratch 里
- durable 结果压缩成 Pre
- 后续 turn 默认只加载 latest inbound + latest Pre + refs

### Governed Delivery

真实外发不是 worker 直接做，而是通过治理链路：

- draft
- review / guard
- approval
- outbox intent
- delivery attempt

## 从这里开始

- [快速开始](./getting-started.zh-CN.md)
- [核心概念](./concepts.zh-CN.md)
- [多智能体协作](./multi-agent-workflows.zh-CN.md)
- [Mail Workbench](./operator-console.zh-CN.md)
- [集成](./integrations.zh-CN.md)

## 对 OpenClaw 用户

推荐路径保持不变：

- 先启动 MailClaw runtime，或者直接运行 `mailclaw gateway`
- 再运行 `mailclaw dashboard`
- 登录 OpenClaw/Gateway
- 点击 `Mail`

`mailclaw open` 才是直达兜底入口，不是主要叙事。
